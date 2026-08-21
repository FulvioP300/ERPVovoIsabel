# Tasks 006 — Cadastro de Produto Assistido por IA

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [003-categorias/tasks.md](../003-categorias/tasks.md),
[004-sku/tasks.md](../004-sku/tasks.md),
[005-produtos-cadastro-manual/tasks.md](../005-produtos-cadastro-manual/tasks.md),
[007-imagens/tasks.md](../007-imagens/tasks.md) (upload de fotos)
**Convenção:** `[P]` = tarefa paralelizável.

## Fase 1 — Contrato e abstração de IA

- [ ] T001 [P] Definir `backend/src/plugins/ai/ai-provider.port.ts`
      (`analyze(prompt: string, images: Buffer[]): Promise<RawAiOutput>`).
- [ ] T002 [P] Implementar `backend/src/schemas/ai-intake.schema.ts`
      (`AiAnalysisInputSchema`, `AiSuggestedProductSchema` — subset **nullable** de
      `product.schema.ts` de 005; nenhum campo pode ser string inventada quando
      indeterminável).

## Fase 2 — Testes

- [ ] T003 [P] Teste unitário `backend/src/services/ai-intake.service.test.ts` com adapter
      **mockado**: payload da IA com campo obrigatório ausente/tipo inválido é rejeitado
      pelo Zod; quando o adapter retorna incerteza para `marca.nome`, o serviço propaga
      `null` — nunca um valor inventado; `categoria_codigo` fora da taxonomia ativa é
      rejeitado via `category.service.assertCategoryActive` (003).
- [ ] T004 Teste de integração `backend/tests/integration/ai-intake.spec.ts` (adapter
      mockado): `POST /api/products/analyze` retorna `{success:true, data:...}` **sem**
      `sku` e **sem** persistir nada em `products`; `POST /api/products/confirm` gera SKU
      (via 004) e persiste (via 005).

## Fase 3 — Implementação core (backend)

- [ ] T005 Implementar `backend/src/plugins/ai/<provider>.adapter.ts` (implementação
      concreta do provedor multimodal escolhido; usa `AI_API_KEY`, nunca exposta ao
      frontend) — depende de T001.
- [ ] T006 Implementar `backend/src/services/ai-intake.service.ts`: chama T005, valida com
      T002, valida `categoria_codigo` via 003, anexa `ai_metadata.fields` quando disponível
      — depende de T002, T005 — faz T003 passar.
- [ ] T007 Implementar `backend/src/services/product-confirm.service.ts`: recebe produto
      revisado, valida com `product.schema.ts` (005), chama `sku.service.generateNextSku`
      (004) e `product.repository.create` (005) — **reaproveita integralmente** a lógica de
      005, não duplica — depende de [005/T008](../005-produtos-cadastro-manual/tasks.md).
- [ ] T008 Implementar `backend/src/routes/ai-intake.routes.ts`:
      `POST /products/analyze` (`@fastify/multipart` + `@fastify/rate-limit` configurável,
      `authorize(["admin","operator"])`) e `POST /products/confirm` — depende de T006, T007
      — faz T004 passar.
- [ ] T009 Registrar `backend/src/modules/ai-intake.module.ts` no `server.ts`.

## Fase 4 — Integração cross-spec

- [ ] T010 Integrar `audit-log.service.record("PRODUCT_CREATE", ..., metadata:
      {ai_metadata})` em `product-confirm.service.ts` — depende de T007 e de
      [008-auditoria/tasks.md](../008-auditoria/tasks.md).

## Fase 5 — Frontend

- [ ] T011 [P] `frontend/src/schemas/ai-intake.schema.ts` (espelha T002).
- [ ] T012 [P] `frontend/src/services/ai-intake.service.ts`
      (`POST /api/products/analyze` multipart, `POST /api/products/confirm`).
- [ ] T013 Implementar `frontend/src/hooks/useAiAnalysis.ts` (TanStack Query mutation com
      estados `loading/success/error/empty`) — depende de T012.
- [ ] T014 Implementar `frontend/src/features/products-ai/AiIntakeForm.tsx` (upload de fotos
      via `ImageUploader` de [007](../007-imagens/tasks.md) + textarea de descrição) —
      depende de T011.
- [ ] T015 Implementar `frontend/src/features/products-ai/AiConfidenceBadges.tsx`
      ("✓ Categoria identificada" / "⚠ Marca não identificada", a partir de
      `ai_metadata.fields`) — depende de T011.
- [ ] T016 Implementar `frontend/src/features/products-ai/AiReviewForm.tsx` (reutiliza
      `ProductForm` de [005](../005-produtos-cadastro-manual/tasks.md) pré-preenchido com o
      resultado da análise) — depende de T013, T015, e de
      [005/T020](../005-produtos-cadastro-manual/tasks.md).
- [ ] T017 Implementar `frontend/src/pages/products/ProductAiIntakePage.tsx`
      (`AiIntakeForm` → `AiReviewForm` → botão explícito "Salvar produto", nunca
      auto-confirmação) — depende de T014, T016.

## Fase 6 — E2E

- [ ] T018 Teste E2E "cadastrar peça utilizando IA" (fotos → descrição → analisar → revisar
      → salvar) — depende de T008–T017. Assertar explicitamente que nada é persistido antes
      do clique em "Salvar produto".
- [ ] T019 Teste E2E "dado desconhecido pela IA": mockar adapter retornando `marca.nome:
      null` e assertar que a UI exibe `⚠` e o formulário mostra o campo vazio, nunca um
      valor inventado.

## Dependências entre tarefas

```
T001,T002 → T005,T006 → T008 → T009
T007 depende de 005 completo (T008 de 005)
T008 → T010 (requer 008-auditoria)
T011,T012 → T013,T014,T015 → T016 → T017 → T018,T019
```
