# Tasks 008 — Auditoria

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [001-autenticacao/tasks.md](../001-autenticacao/tasks.md),
[002-usuarios/tasks.md](../002-usuarios/tasks.md) (`authorize.middleware.ts`)
**Convenção:** `[P]` = tarefa paralelizável.

**Prioridade de implementação:** este módulo deve ser concluído **antes** (ou em paralelo
imediato com) 001–006, já que todos eles chamam `audit-log.service.record()`.

## Fase 1 — Testes

- [ ] T001 [P] Teste unitário `backend/src/services/audit-log.service.test.ts`: `record()`
      monta o documento correto (`userId`, `action`, `entity`, `entityId`, `timestamp`,
      `metadata`) para cada tipo de ação do enum.
- [ ] T002 Teste de integração `backend/tests/integration/audit-logs.spec.ts`: login falho
      gera `LOGIN_FAILED`; alteração de preço gera `PRICE_UPDATE` com `oldValue`/`newValue`;
      `operator` recebe 403 em `GET /api/audit-logs`.

## Fase 2 — Implementação core

- [ ] T003 [P] Implementar `backend/src/schemas/audit-log.schema.ts`
      (`AuditActionEnum` com os 13 valores da spec, `AuditLogSchema`).
- [ ] T004 Implementar `backend/src/repositories/audit-log.repository.ts` (apenas `insertOne`
      e `find` — nenhum `updateOne`/`deleteOne` exposto, reforçando imutabilidade na camada
      de dados) — depende de T003.
- [ ] T005 Implementar `backend/src/services/audit-log.service.ts` (`record(action, entity,
      entityId, userId, metadata?)`; falha de gravação é logada e **não** interrompe a
      operação de negócio principal) — depende de T004 — faz T001 passar.
- [ ] T006 Implementar `backend/src/routes/audit-log.routes.ts`
      (`GET /api/audit-logs`, `authorize(["admin"])`, paginação e filtros por
      entidade/ação/usuário/período) — depende de T005 — faz T002 passar.
- [ ] T007 Registrar `backend/src/modules/audit-log.module.ts` no `server.ts`.

## Fase 3 — Frontend

- [ ] T008 [P] `frontend/src/services/audit-log.service.ts` (`GET /api/audit-logs`).
- [ ] T009 Implementar `frontend/src/hooks/useAuditLogs.ts` — depende de T008.
- [ ] T010 Implementar `frontend/src/pages/admin/AuditLogsPage.tsx` (acessível apenas no
      menu de admin) — depende de T009.

## Dependências entre tarefas

```
T003 → T004 → T005 → T006 → T007
T008 → T009 → T010
```

## Consumido por

`audit-log.service.record()` (T005) é importado diretamente por:
[001-autenticacao](../001-autenticacao/tasks.md) (T015),
[002-usuarios](../002-usuarios/tasks.md) (T010),
[003-categorias](../003-categorias/tasks.md) (T009),
[005-produtos-cadastro-manual](../005-produtos-cadastro-manual/tasks.md) (T012),
[006-produtos-cadastro-ia](../006-produtos-cadastro-ia/tasks.md) (T010).
