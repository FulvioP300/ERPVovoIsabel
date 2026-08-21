# Tasks 003 — Categorias

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [001-autenticacao/tasks.md](../001-autenticacao/tasks.md),
[002-usuarios/tasks.md](../002-usuarios/tasks.md) (usa `authorize.middleware.ts`)
**Convenção:** `[P]` = tarefa paralelizável.

## Fase 1 — Testes

- [ ] T001 [P] Teste unitário `backend/src/services/category.service.test.ts`:
      `assertCategoryActive` lança erro para código inexistente e para código inativo;
      `code` duplicado é rejeitado na criação.
- [ ] T002 Teste de integração `backend/tests/integration/categories.spec.ts`:
      `POST /api/categories` com `code` duplicado retorna erro; `GET /api/categories` reflete
      apenas categorias ativas quando filtrado; `POST`/`PATCH` exigem `role=admin`.

## Fase 2 — Implementação core (backend)

- [ ] T003 [P] Implementar `backend/src/schemas/category.schema.ts`
      (`CategorySchema`, `CreateCategorySchema` — `code` em regex maiúsculo 3–6 chars).
- [ ] T004 Implementar `backend/src/repositories/category.repository.ts`
      (`findByCode`, `list`, `create`, `updateStatus`, índice único em `code`) — depende de
      T003.
- [ ] T005 Implementar `backend/src/services/category.service.ts`
      (`assertCategoryActive(code)`, regra de `code` único) — depende de T004 — faz T001
      passar.
- [ ] T006 Implementar `backend/src/routes/category.routes.ts` (`GET` com `authenticate`;
      `POST`/`PATCH` com `authorize(["admin"])` de 002) — depende de T005 — faz T002 passar.
- [ ] T007 Registrar `backend/src/modules/category.module.ts` no `server.ts`.
- [ ] T008 Script de seed único (fora do runtime) com o catálogo de referência: BERM, CALC,
      CAMI, POLO, VEST, JAQU, BLUS, SAIA, SAPT, BOLS, ACES — depende de T004.

## Fase 3 — Integração cross-spec

- [ ] T009 Integrar `audit-log.service.record("CATEGORY_CREATE" | "CATEGORY_UPDATE" |
      "CATEGORY_DISABLE", ...)` em `category.service.ts` — depende de T005 e de
      [008-auditoria/tasks.md](../008-auditoria/tasks.md).

## Fase 4 — Frontend

- [ ] T010 [P] Implementar `frontend/src/schemas/category.schema.ts`.
- [ ] T011 [P] Implementar `frontend/src/services/category.service.ts` (`/api/categories`).
- [ ] T012 Implementar `frontend/src/hooks/useCategories.ts` (TanStack Query — reutilizado
      como fonte de opções em 005/006) — depende de T011.
- [ ] T013 Implementar `frontend/src/pages/admin/CategoriesPage.tsx` — depende de T010, T012.

## Dependências entre tarefas

```
T003 → T004 → T005 → T006 → T007
T004 → T008
T005 → T009 (requer 008-auditoria)
T010,T011 → T012 → T013
```

## Nota crítica

`category.service.assertCategoryActive` (T005) é a **fronteira que impede a IA de inventar
categorias fora da taxonomia permitida** (constituição, princípio I). É consumida
diretamente por [004-sku](../004-sku/tasks.md), [005](../005-produtos-cadastro-manual/tasks.md)
e [006](../006-produtos-cadastro-ia/tasks.md) — não deve ser reimplementada nesses módulos.
