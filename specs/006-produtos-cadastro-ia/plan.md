# Plan 006 — Cadastro de Produto Assistido por IA

**Spec:** [spec.md](spec.md)
**Constituição:** [memory/constitution.md](../../memory/constitution.md)
**Depende de:** [003-categorias/plan.md](../003-categorias/plan.md), [004-sku/plan.md](../004-sku/plan.md), [005-produtos-cadastro-manual/plan.md](../005-produtos-cadastro-manual/plan.md)

## 1. Stack técnica (seção 4.5 da especificação original)

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + TypeScript + Fastify |
| Upload | `@fastify/multipart` (`multipart/form-data`: `prompt` + `images[]`) |
| IA | Modelo multimodal (texto + imagens → structured output), chamado **exclusivamente** pelo backend — `AI_API_KEY` nunca exposta ao frontend |
| Validação | Zod (valida a saída estruturada da IA antes de qualquer uso) |
| Rate limit | `@fastify/rate-limit` em `/products/analyze` (ex.: 10/min/usuário, configurável) |
| Banco | MongoDB Atlas — sem escrita nesta etapa; escrita ocorre via 004+005 na confirmação |
| Frontend | React + Vite 8 + TypeScript + React Hook Form + Zod + TanStack Query |

Explicitamente **não** utilizar LangChain/LangGraph nesta fase (constituição, princípio V) —
chamada direta ao SDK/API do provedor de IA, encapsulada em um único adapter. **Nenhuma
capacidade de function/tool calling é configurada no adapter** — decisão de segurança
permanente, não temporária (spec, seção 8.2/10).

## 2. Contexto técnico

Camada de IA é um **adapter substituível** (constituição, princípio VI): a lógica de
domínio nunca depende do provedor específico. `AiProviderPort` define a interface; a
implementação concreta (ex.: `OpenAiVisionAdapter`) fica isolada em `plugins/ai/`.

## 3. Estrutura de arquivos

```
shared/schemas/
└── ai-intake.schema.ts                  # AiSuggestedProductSchema — fonte única (backend valida a IA, frontend tipa/parseia a resposta e monta os badges)

backend/src/
├── plugins/ai/ai-provider.port.ts       # interface: analyze(prompt, images[]) => RawAiOutput
├── plugins/ai/<provider>.adapter.ts     # implementação concreta do provedor multimodal
├── schemas/ai-intake.schema.ts          # reexporta AiSuggestedProductSchema de shared/dist + AiAnalysisInputSchema (só backend)
├── services/ai-intake.service.ts        # orquestra: chama adapter → valida Zod → aplica taxonomia de categorias (003)
├── services/product-confirm.service.ts  # recebe produto revisado → reusa product.service (005) + sku.service (004)
├── routes/ai-intake.routes.ts           # POST /products/analyze, POST /products/confirm
└── modules/ai-intake.module.ts

frontend/src/
├── schemas/ai-intake.schema.ts          # reexporta AiSuggestedProductSchema de shared/dist + aiSuggestionToFormValues/buildConfidenceBadges
├── services/ai-intake.service.ts        # POST /api/products/analyze (multipart, File[] direto — sem Azure Blob antes), POST /api/products/confirm
├── hooks/useAiAnalysis.ts               # TanStack Query mutation com estados loading/success/error/empty
├── pages/products/ProductAiIntakePage.tsx  # orquestra intake → upload real das fotos (007) → revisão → confirm
├── features/products-ai/AiIntakeForm.tsx      # picker de fotos PRÓPRIO (preview local, sem upload) + textarea — não é o ImageUploader de 007
├── features/products-ai/AiReviewForm.tsx      # reutiliza ProductForm (005) pré-preenchido — é aqui que o ImageUploader de 007 entra, dentro do ProductForm
└── features/products-ai/AiConfidenceBadges.tsx  # "✓ Categoria identificada / ⚠ Marca não identificada"
```

## 4. Fluxo de execução (camadas)

```
AiIntakeForm (fotos + descrição)
  → ai-intake.service.ts (POST /api/products/analyze, multipart/form-data)
  → routes/ai-intake.routes.ts (rate-limit + authenticate + authorize(["admin","operator"]))
  → services/ai-intake.service.ts
      → plugins/ai/<provider>.adapter.ts (texto + imagens → structured output bruto)
      → schemas/ai-intake.schema.ts (Zod: valida/rejeita campos fora do contrato)
      → services/category.service.assertCategoryActive (003) — rejeita categoria inventada
  → resposta { success: true, data: AiSuggestedProduct } (sem sku)
  → AiReviewForm (operador revisa/edita) → "Salvar produto"
  → ai-intake.service.ts (POST /api/products/confirm)
  → services/product-confirm.service.ts
      → schemas/product.schema.ts (validação completa, 005)
      → sku.service.generateNextSku (004)
      → product.repository.create (005)
  → audit_logs (PRODUCT_CREATE, ai_metadata.generated = true), ver 008
```

## 5. Passos de implementação

1. `plugins/ai/ai-provider.port.ts`: contrato `analyze(prompt: string, images: Buffer[]):
   Promise<RawAiOutput>` — nenhuma outra camada conhece o SDK do provedor.
2. `schemas/ai-intake.schema.ts`: subset de `product.schema.ts` (005) que a IA pode
   preencher; campos não determináveis são `.nullable()` e devem chegar como `null`, nunca
   `undefined` silencioso ou string inventada. `AiSuggestedProductSchema` é **`.strict()`**
   (spec, seção 8.2-B) — qualquer chave fora do schema rejeita a resposta inteira, nunca é
   descartada em silêncio. O schema nunca declara `sku`, `preco`, `status`, `estoque`,
   `ecommerce` ou `venda` (spec, seção 8.2-C).
3. `services/ai-intake.service.ts`: monta o prompt de sistema com os guardrails da spec
   (seção 8.3, configurado como `systemPrompt` do `OpenAiCompatibleAdapterConfig`) e, por
   requisição, concatena em blocos delimitados **o schema exato de resposta exigido** (`
   RESPONSE_SCHEMA_TEMPLATE`, ver spec seção 8.3 nota de implementação — sem isso o modelo
   improvisa a estrutura e `.strict()` rejeita tudo, descoberto testando contra o provedor
   real) + a lista de categorias ativas (003) + a descrição literal do operador (spec, seção
   8.3) antes de chamar o adapter; valida a saída com Zod (T002), revalida `categoria_codigo`
   contra 003 via `category.service.assertCategoryActive` — **independente do que o prompt
   pediu** (spec, seção 8.2-D) — e, se o provedor retornar, propaga `ai_metadata.fields`
   (metadado de exibição apenas, nunca usado para decidir validação).
4. `routes/ai-intake.routes.ts`: `POST /products/analyze` com `@fastify/multipart` e
   `@fastify/rate-limit` (limite configurável via env, ex. `AI_ANALYZE_RATE_LIMIT`);
   `POST /products/confirm` delega a `product-confirm.service.ts`.
5. `services/product-confirm.service.ts`: reaproveita integralmente `product.service.ts` de
   005 — não duplica lógica de geração de SKU nem de persistência; a única diferença do
   cadastro manual é a origem dos dados (IA + revisão humana vs. digitação direta).
6. Frontend: `AiIntakeForm` (picker de fotos local — sem upload ainda, `/analyze` usa os
   bytes direto — + textarea de descrição) → estados `loading/success/error/empty` → ao
   suceder, as mesmas fotos escolhidas viram upload real (`useImageUpload`, 007) →
   `AiReviewForm` reaproveitando `ProductForm` (005), pré-preenchido com os valores da análise
   e com essas fotos já na seção Fotos → `AiConfidenceBadges` indicando o que foi/não foi
   identificado.
7. Garantir que o botão final é sempre o próprio submit do `ProductForm` ("Cadastrar
   produto"), acionado pelo operador — nenhuma chamada a `/confirm` é disparada
   automaticamente após `/analyze`.

## 6. Testes planejados

- Unitário: `ai-intake.schema` rejeita payload com campo obrigatório ausente ou tipo
  inválido; `ai-intake.service` propaga `null` sem inventar valores quando o adapter retorna
  incerteza. **Segurança (spec, seção 8.4)**: mock do adapter retornando `sku`, `preco`,
  `status`, `estoque` ou `ecommerce` no JSON é rejeitado pelo `.strict()` — nunca chega
  silenciosamente ao service; mock retornando `categoria_codigo` fora da taxonomia ativa (ou
  inexistente) é rejeitado por `assertCategoryActive`, mesmo com JSON estruturalmente válido.
- Integração: `POST /products/analyze` com adapter mockado retorna estrutura validada, sem
  `sku`, sem persistência; `POST /products/confirm` gera SKU e persiste via 004/005.
- E2E: cadastrar peça utilizando IA — do upload de fotos até "Salvar produto" (critério de
  aceite da spec); "dado desconhecido pela IA" (T019, tasks.md).

## 7. Riscos / decisões em aberto

- ~~Escolha do provedor de IA multimodal concreto~~ — resolvido parcialmente pelo
  [ADR-002](../../memory/decisions.md#adr-002--adapter-de-ia-genérico-compatível-com-a-api-openai):
  `plugins/ai/openai-compatible.adapter.ts` fala com qualquer provedor compatível com o
  formato OpenAI Chat Completions, configurável via `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`.
  Ainda em aberto: qual provedor efetivamente usar em produção (OpenAI, OpenRouter, um
  servidor self-hosted etc.) — decisão de custo/operação, não de código.
- Definir formato exato de `AI_ANALYZE_RATE_LIMIT` (por usuário vs. por IP) na implementação.
