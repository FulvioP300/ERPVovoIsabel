# Tasks 009 — Dashboard Administrativo

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [005-produtos-cadastro-manual/tasks.md](../005-produtos-cadastro-manual/tasks.md),
[002-usuarios/tasks.md](../002-usuarios/tasks.md) (permissões de menu)
**Convenção:** `[P]` = tarefa paralelizável.

## Fase 1 — Testes

- [ ] T001 [P] Teste unitário `backend/src/services/dashboard.service.test.ts` com fixtures
      de produtos cobrindo os 6 indicadores (disponíveis, cadastrados hoje, vendidos, em
      revisão, sem preço, sem imagens).
- [ ] T002 Teste de integração `backend/tests/integration/dashboard.spec.ts`:
      `GET /api/dashboard/summary` retorna os 6 campos esperados com valores corretos.

## Fase 2 — Implementação core (backend)

- [ ] T003 Implementar `backend/src/services/dashboard.service.ts` (`getSummary()` — os 6
      `countDocuments`/`aggregate` em `Promise.all`, ver mapeamento no plan.md) — depende do
      repositório de produtos ([005/T006](../005-produtos-cadastro-manual/tasks.md)) — faz
      T001 passar.
- [ ] T004 Implementar `backend/src/routes/dashboard.routes.ts`
      (`GET /api/dashboard/summary`, apenas `authenticate`) — depende de T003 — faz T002
      passar.
- [ ] T005 Registrar `backend/src/modules/dashboard.module.ts` no `server.ts`.

## Fase 3 — Frontend

- [ ] T006 [P] `frontend/src/services/dashboard.service.ts`.
- [ ] T007 [P] `frontend/src/components/Sidebar.tsx` (itens filtrados por role, reutiliza
      helper de permissões de [002](../002-usuarios/tasks.md)).
- [ ] T008 [P] `frontend/src/components/Header.tsx`.
- [ ] T009 [P] `frontend/src/components/Loading.tsx`.
- [ ] T010 Implementar `frontend/src/layouts/BackofficeLayout.tsx` (Sidebar + Header +
      área de conteúdo) — depende de T007, T008.
- [ ] T011 Implementar `frontend/src/hooks/useDashboardSummary.ts` — depende de T006.
- [ ] T012 Implementar `frontend/src/pages/DashboardPage.tsx` (6 `Card`s reutilizando
      `Card.tsx` de [005](../005-produtos-cadastro-manual/tasks.md), estados
      loading/error) — depende de T009, T011.

## Fase 4 — E2E

- [ ] T013 Teste E2E: login redireciona ao dashboard e os 6 indicadores carregam sem erro —
      depende de T004–T012 e de [001-autenticacao/tasks.md](../001-autenticacao/tasks.md).

## Dependências entre tarefas

```
T003 → T004 → T005
T007,T008 → T010
T006 → T011
T009,T011 → T012
T010,T012 → T013
```
