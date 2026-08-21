# Tasks 002 — Usuários e RBAC

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [001-autenticacao/tasks.md](../001-autenticacao/tasks.md)
**Convenção:** `[P]` = tarefa paralelizável.

## Fase 1 — Testes (escrever antes da implementação)

- [ ] T001 [P] Teste unitário `backend/src/middleware/authorize.middleware.test.ts`:
      `authorize(["admin"])` permite `role=admin` e rejeita `operator`/`viewer` com 403.
- [ ] T002 [P] Teste unitário `backend/src/services/user.service.test.ts`: e-mail duplicado
      é rejeitado; senha com menos de 8 caracteres é rejeitada; usuário criado como
      `status=active` com `createdBy` preenchido.
- [ ] T003 Teste de integração `backend/tests/integration/users.spec.ts`: `POST /api/users`
      cria usuário com hash Argon2id; `PATCH /api/users/:id/status` nunca remove fisicamente
      o documento; `operator` recebe 403 em qualquer rota de `/api/users`.

## Fase 2 — Implementação core (backend)

- [ ] T004 [P] Implementar `backend/src/middleware/authorize.middleware.ts`
      (`authorize(roles: Role[])`, reutilizável por todos os módulos) — faz T001 passar.
- [ ] T005 [P] Implementar `backend/src/schemas/user.schema.ts`
      (`CreateUserSchema`, `UpdateUserSchema`, `UserSchema`).
- [ ] T006 Estender `backend/src/repositories/user.repository.ts` (de 001) com `create`,
      `list` (busca por nome/e-mail), `updateStatus`, `updateRole`, `updatePassword` —
      depende de 001/T009.
- [ ] T007 Implementar `backend/src/services/user.service.ts` (valida e-mail único, aplica
      `createdBy`, reutiliza `password.service.ts` de 001) — depende de T005, T006 — faz
      T002 passar.
- [ ] T008 Implementar `backend/src/routes/user.routes.ts` (6 rotas, todas com
      `authenticate` + `authorize(["admin"])`) — depende de T004, T007 — faz T003 passar.
- [ ] T009 Registrar `backend/src/modules/user.module.ts` no `server.ts`.

## Fase 3 — Integração cross-spec

- [ ] T010 Integrar `audit-log.service.record("USER_CREATE" | "USER_UPDATE" |
      "USER_DISABLE", ...)` em `user.service.ts` — depende de T007 e de
      [008-auditoria/tasks.md](../008-auditoria/tasks.md).

## Fase 4 — Frontend

- [ ] T011 [P] Implementar `frontend/src/schemas/user.schema.ts` (`UserFormSchema`).
- [ ] T012 [P] Implementar `frontend/src/services/user.service.ts` (`/api/users/*`).
- [ ] T013 [P] Implementar `frontend/src/components/Table.tsx` (reutilizável — também usado
      em 005).
- [ ] T014 [P] Implementar `frontend/src/components/Badge.tsx` (status ativo/inativo/
      bloqueado).
- [ ] T015 Implementar `frontend/src/hooks/useUsers.ts` (list + mutations via TanStack
      Query) — depende de T012.
- [ ] T016 Implementar `frontend/src/components/UserForm.tsx` (RHF + Zod) — depende de T011.
- [ ] T017 Implementar `frontend/src/pages/admin/UsersPage.tsx` (listagem + busca) —
      depende de T013, T014, T015.
- [ ] T018 Implementar `frontend/src/pages/admin/UserFormPage.tsx` (criação/edição) —
      depende de T016, T015.
- [ ] T019 Bloquear rota `/admin/users` no client-side para perfis diferentes de `admin`
      (guarda de rota reaproveitando `ProtectedRoute` de 001 + checagem de role) — depende
      de T017, T018.

## Fase 5 — E2E

- [ ] T020 Teste E2E "criação e alteração de usuário por admin" — depende de T008–T019.
- [ ] T021 Teste E2E "acesso negado (403) para operador em /admin/users" (front e back) —
      depende de T008, T019.

## Dependências entre tarefas

```
T004,T005 → T007 (T006 também necessário)
T007 → T008 → T009
T007 → T010 (requer 008)
T011,T012 → T015,T016
T013,T014,T015 → T017
T016,T015 → T018
T017,T018 → T019 → T020,T021
```
