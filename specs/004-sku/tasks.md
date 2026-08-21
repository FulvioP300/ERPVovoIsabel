# Tasks 004 — Geração de SKU

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [003-categorias/tasks.md](../003-categorias/tasks.md)
**Convenção:** `[P]` = tarefa paralelizável.

## Fase 1 — Testes (a mais crítica do MVP — priorizar)

- [ ] T001 [P] Teste unitário `backend/src/services/sku.service.test.ts`: dado
      `BERM.currentValue = 24`, `generateNextSku("BERM")` retorna `BVI-BERM-000025` e
      persiste `currentValue = 25`.
- [ ] T002 Teste de **concorrência** `backend/tests/integration/sku-concurrency.spec.ts`:
      disparar N (ex. 20) chamadas simultâneas de `generateNextSku("BERM")` contra o MongoDB
      de teste e assertar N SKUs distintos, sequenciais, sem colisão. Este teste é o
      critério de aceite "concorrência" da spec — não pode ser pulado nem simplificado.
- [ ] T003 Teste de integração: inserir produto com `sku` já existente deve ser rejeitado
      pelo índice único de `products.sku` (depende do índice criado em
      [005](../005-produtos-cadastro-manual/tasks.md)).

## Fase 2 — Implementação core

- [ ] T004 [P] Implementar `backend/src/schemas/sku.schema.ts`
      (`SkuSchema`, regex `/^BVI-[A-Z]{3,6}-\d{6}$/`).
- [ ] T005 Implementar `backend/src/repositories/sku-sequence.repository.ts`
      (`incrementAndGet(categoryCode)` via `findOneAndUpdate` atômico com `$inc` e
      `upsert: true` — **nunca** ler o valor atual antes de incrementar).
- [ ] T006 Implementar `backend/src/services/sku.service.ts` (`generateNextSku(categoryCode)`
      — valida categoria via `category.service.assertCategoryActive` de
      [003](../003-categorias/tasks.md), incrementa via T005, formata com zero-padding) —
      depende de T004, T005 — faz T001 e T002 passarem.

## Dependências entre tarefas

```
T004,T005 → T006 → T001,T002 (validação)
T006 é consumido por 005/T00x (criação de produto) e 006/T00x (confirmação via IA)
```

## Nota crítica

`sku.service.generateNextSku` (T006) só pode ser chamado dentro da operação de persistência
final do produto (`POST /api/products` em [005](../005-produtos-cadastro-manual/tasks.md) e
`POST /api/products/confirm` em [006](../006-produtos-cadastro-ia/tasks.md)) — nunca durante
`POST /api/products/analyze`. Qualquer implementação alternativa que leia
`sku_sequences.currentValue` e some 1 manualmente viola o princípio III da constituição e deve
ser rejeitada em revisão de código.
