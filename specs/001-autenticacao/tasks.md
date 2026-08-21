# Tasks 001 — Autenticação

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Convenção:** `[P]` = tarefa paralelizável (arquivo independente, sem dependência de outra
tarefa em andamento). Tarefas sem `[P]` devem respeitar a ordem listada.

## Fase 1 — Setup

- [ ] T001 Criar conexão singleton com MongoDB Atlas em `backend/src/database/mongo.client.ts`
      (lê `MONGODB_URI`, exporta `getDb()`).
- [ ] T002 [P] Registrar `@fastify/cookie` em `backend/src/plugins/cookie.plugin.ts`.
- [ ] T003 [P] Registrar `@fastify/rate-limit` (global, sem limite específico ainda) em
      `backend/src/plugins/rate-limit.plugin.ts`.

## Fase 2 — Testes (escrever antes da implementação)

- [ ] T004 [P] Teste unitário `backend/src/services/password.service.test.ts`: hash gera valor
      diferente da senha original; `verifyPassword` aceita a senha correta e rejeita incorreta.
- [ ] T005 [P] Teste unitário `backend/src/services/auth.service.test.ts`: credenciais
      corretas autenticam; senha incorreta e e-mail inexistente retornam o mesmo erro
      genérico; usuário `inactive`/`blocked` não autentica.
- [ ] T006 Teste de integração `backend/tests/integration/auth.spec.ts` (Fastify + MongoDB
      em memória/teste): `POST /api/auth/login` sucesso emite cookies; falha não revela
      existência do e-mail; `GET /api/auth/me` retorna 401 sem cookie válido e 200 com cookie
      válido.

## Fase 3 — Implementação core (faz os testes da Fase 2 passarem)

- [ ] T007 [P] Implementar `backend/src/schemas/auth.schema.ts`
      (`LoginInputSchema`, `AuthMeOutputSchema`).
- [ ] T008 [P] Implementar `backend/src/services/password.service.ts`
      (`hashPassword`, `verifyPassword` com Argon2id) — faz T004 passar.
- [ ] T009 Implementar `backend/src/repositories/user.repository.ts`
      (`findByEmail`, `updateLastLogin`) — depende de T001.
- [ ] T010 Implementar `backend/src/services/auth.service.ts`
      (`verifyCredentials`, `issueTokens`, `refresh`) — depende de T007, T008, T009 — faz
      T005 passar.
- [ ] T011 Implementar `backend/src/middleware/authenticate.middleware.ts`
      (popula `request.user` a partir do access token no cookie) — depende de T010.
- [ ] T012 Implementar `backend/src/routes/auth.routes.ts`
      (`POST /login`, `POST /logout`, `POST /refresh`, `GET /me`) — depende de T010, T011 —
      faz T006 passar.
- [ ] T013 Aplicar `@fastify/rate-limit` especificamente em `POST /api/auth/login` — depende
      de T003, T012.
- [ ] T014 Registrar `backend/src/modules/auth.module.ts` no bootstrap do servidor
      (`backend/src/server.ts`) — depende de T012.

## Fase 4 — Integração cross-spec

- [ ] T015 Integrar `audit-log.service.record("LOGIN_SUCCESS" | "LOGIN_FAILED", ...)` dentro
      de `auth.service.ts` — depende de T010 e de
      [008-auditoria/tasks.md](../008-auditoria/tasks.md) (T00x de `audit-log.service.ts`).

## Fase 5 — Frontend

- [ ] T016 [P] Implementar `frontend/src/schemas/auth.schema.ts` (`LoginFormSchema`, espelha
      T007).
- [ ] T017 [P] Implementar `frontend/src/services/auth.service.ts` (chamadas para
      `/api/auth/*`).
- [ ] T018 Implementar `frontend/src/hooks/useAuth.ts` (TanStack Query sobre `GET /me`) —
      depende de T017.
- [ ] T019 Implementar `frontend/src/pages/LoginPage.tsx` (React Hook Form + Zod, exibição de
      erro genérico) — depende de T016, T017.
- [ ] T020 Implementar `frontend/src/app/routes/ProtectedRoute.tsx` (redireciona para
      `/login` quando sessão inválida) — depende de T018.

## Fase 6 — E2E

- [ ] T021 Teste E2E "login completo até o dashboard" — depende de T012–T020 e de
      [009-dashboard/tasks.md](../009-dashboard/tasks.md).

## Dependências entre tarefas

```
T001 → T009 → T010 → T011 → T012 → T013 → T014
T007,T008 → T010
T010 → T015 (requer audit-log.service de 008)
T016,T017 → T018 → T020
T016,T017 → T019
T012 + T019 + T020 → T021
```
