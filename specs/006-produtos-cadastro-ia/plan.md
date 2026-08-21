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
chamada direta ao SDK/API do provedor de IA, encapsulada em um único adapter.

## 2. Contexto técnico

Camada de IA é um **adapter substituível** (constituição, princípio VI): a lógica de
domínio nunca depende do provedor específico. `AiProviderPort` define a interface; a
implementação concreta (ex.: `OpenAiVisionAdapter`) fica isolada em `plugins/ai/`.

## 3. Estrutura de arquivos

```
backend/src/
├── plugins/ai/ai-provider.port.ts       # interface: analyze(prompt, images[]) => RawAiOutput
├── plugins/ai/<provider>.adapter.ts     # implementação concreta do provedor multimodal
├── schemas/ai-intake.schema.ts          # AiAnalysisInputSchema, AiSuggestedProductSchema (subset de product.schema)
├── services/ai-intake.service.ts        # orquestra: chama adapter → valida Zod → aplica taxonomia de categorias (003)
├── services/product-confirm.service.ts  # recebe produto revisado → reusa product.service (005) + sku.service (004)
├── routes/ai-intake.routes.ts           # POST /products/analyze, POST /products/confirm
└── modules/ai-intake.module.ts

frontend/src/
├── schemas/ai-intake.schema.ts          # espelha AiSuggestedProductSchema
├── services/ai-intake.service.ts        # POST /api/products/analyze (multipart), POST /api/products/confirm
├── hooks/useAiAnalysis.ts               # TanStack Query mutation com estados loading/success/error
├── pages/products/ProductAiIntakePage.tsx
├── features/products-ai/AiIntakeForm.tsx      # upload de fotos + textarea de descrição
├── features/products-ai/AiReviewForm.tsx      # reutiliza ProductForm (005) pré-preenchido
├── features/products-ai/AiConfidenceBadges.tsx  # "✓ Categoria identificada / ⚠ Marca não identificada"
└── components/ImageUploader.tsx          # <input capture="environment">, usado também em 007
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
   `undefined` silencioso ou string inventada.
3. `services/ai-intake.service.ts`: chama o adapter, valida com Zod, valida `categoria_codigo`
   contra 003, e — se configurado — anexa `ai_metadata.fields["<campo>"] = {confidence,
   source}` quando o provedor retornar esse dado.
4. `routes/ai-intake.routes.ts`: `POST /products/analyze` com `@fastify/multipart` e
   `@fastify/rate-limit` (limite configurável via env, ex. `AI_ANALYZE_RATE_LIMIT`);
   `POST /products/confirm` delega a `product-confirm.service.ts`.
5. `services/product-confirm.service.ts`: reaproveita integralmente `product.service.ts` de
   005 — não duplica lógica de geração de SKU nem de persistência; a única diferença do
   cadastro manual é a origem dos dados (IA + revisão humana vs. digitação direta).
6. Frontend: `AiIntakeForm` (upload + descrição) → estados `loading/success/error/empty` →
   `AiReviewForm` reaproveitando `ProductForm` (005) com valores iniciais vindos da análise →
   `AiConfidenceBadges` para indicar o que foi/não foi identificado.
7. Garantir que o botão final é sempre "Salvar produto" acionado pelo operador — nenhuma
   chamada a `/confirm` é disparada automaticamente após `/analyze`.

## 6. Testes planejados

- Unitário: `ai-intake.schema` rejeita payload com campo obrigatório ausente ou tipo
  inválido; `ai-intake.service` propaga `null` sem inventar valores quando o adapter retorna
  incerteza.
- Integração: `POST /products/analyze` com adapter mockado retorna estrutura validada, sem
  `sku`, sem persistência; `POST /products/confirm` gera SKU e persiste via 004/005.
- E2E: cadastrar peça utilizando IA — do upload de fotos até "Salvar produto" (critério de
  aceite da spec).

## 7. Riscos / decisões em aberto

- Escolha do provedor de IA multimodal concreto (`<provider>.adapter.ts`) não é fixada nesta
  fase — qualquer provedor compatível com texto+imagem→structured output serve, desde que
  acessado só pelo backend.
- Definir formato exato de `AI_ANALYZE_RATE_LIMIT` (por usuário vs. por IP) na implementação.
