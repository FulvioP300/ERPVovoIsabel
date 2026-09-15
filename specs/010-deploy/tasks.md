# Tasks 010 — Deploy em Container (Azure Container Apps — só produção)

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** specs 001–009 (código já implementado)
**Convenção:** `[P]` = tarefa paralelizável.

## Fase 1 — Backend serve o frontend estático

- [x] T001 [P] Implementar `backend/src/plugins/static.plugin.ts`: registra `@fastify/static`
      apontando para o diretório do build do frontend; `setNotFoundHandler` devolve
      `index.html` para qualquer rota fora de `/api/*` (fallback SPA). Só registra se o
      diretório existir (`fs.existsSync`) — nunca ativa em `npm run dev` local.
- [x] T002 Registrar `static.plugin.ts` em `backend/src/app.ts`, **depois** de todos os
      módulos de rota `/api/*` (ordem importa: o fallback SPA não pode interceptar rotas de
      API) — depende de T001.
- [x] T003 [P] Teste unitário: com o diretório do build inexistente, o plugin não registra
      nada (nenhuma rota extra, nenhum erro) — cobre o caminho de dev local.

## Fase 2 — Container (também é o ambiente de teste, local)

- [x] T004 `Dockerfile` multi-stage (`shared-build` → `backend-build` → `frontend-build` →
      `runtime`), `node:22-alpine`, usuário não-root no estágio final, `HEALTHCHECK` via
      `GET /api/health` — depende de T001, T002.
- [x] T005 [P] `.dockerignore` (`node_modules`, `.env*`, `dist/`, `.git`, `coverage`).
- [x] T006 `docker-compose.yml` (serviço único `app`, porta mapeada, `env_file`,
      `healthcheck`) + `docker-compose.example.env` (template das variáveis, apontando pro
      Mongo/Blob Storage de **teste** por padrão — este é o ambiente de teste de fato, não só
      uma validação de smoke test) — depende de T004.

## Fase 3 — CI (build, teste, publicação da imagem)

- [x] T007 [P] `.github/workflows/ci.yml`: lint + typecheck + test em `shared/`, `backend/`,
      `frontend/` (mesmos comandos já usados manualmente) em todo push/PR.
- [x] T008 `.github/workflows/deploy.yml` (job de build+push): `docker build` + `docker push`
      para `ghcr.io/<owner>/<repo>` (`:sha` e `:latest`), só em push para `main`, condicionado
      ao job de CI (T007) ter passado — depende de T004, T007.

## Fase 4 — Infraestrutura Azure Container Apps (só produção, provisionamento único, manual)

- [x] T009 `infra/aca/provision.sh` (az cli, idempotente): **exige** a variável de ambiente
      `AZURE_SUBSCRIPTION_ID` (a subscription com os créditos que o usuário já tem) e roda
      `az account set --subscription "$AZURE_SUBSCRIPTION_ID"` como primeiro passo, saindo com
      erro claro se não estiver setada — nunca usa a subscription default do `az login` em
      silêncio. Em seguida cria o Resource Group (se não existir), o Container Apps
      Environment, e **só** o Container App de produção (`ca-vovoisabel-prod`) com
      `minReplicas: 1`, `maxReplicas: 3`, ingress externo HTTPS na porta de `PORT`. Nenhum
      Container App de dev/test é criado.
- [x] T010 Configurar os secrets do Container App de produção via `az containerapp secret
      set`: `mongodb-uri`, `jwt-access-secret`, `jwt-refresh-secret`,
      `azure-storage-connection-string`, `ai-api-key` (credenciais de produção — as de
      dev/test continuam só em `.env`/`docker-compose.example.env` locais). Variáveis não
      sensíveis (`AZURE_STORAGE_CONTAINER_NAME`, `AI_MODEL`, `AI_BASE_URL`, `FRONTEND_URL`)
      como env var normal — `FRONTEND_URL` = URL pública que o ACA atribui ao Container App —
      depende de T009. **Rodado contra `ca-vovoisabel-prod` de verdade: Mongo Atlas de
      produção (`mongodbEnvironments/prod_atlas-credentials.env`), JWT secrets novos gerados
      só pra produção (nunca reaproveitados de dev/test), Storage Account compartilhada
      (ADR-003) com o container `product-images-prod` já existente, e o mesmo provedor de IA
      usado em dev/test (não há chave separada por ambiente pra IA).**
- [x] T011 Configurar credencial federada OIDC entre o GitHub Actions (repo + branch `main`) e
      uma Managed Identity/Service Principal do Azure, criada **na mesma subscription do
      T009** (`AZURE_SUBSCRIPTION_ID`), com permissão restrita só a
      `Microsoft.App/containerApps/*` no Resource Group (nunca `Contributor` na subscription
      inteira). O mesmo `AZURE_SUBSCRIPTION_ID` vira secret do GitHub Actions, consumido pelo
      `azure/login` no job de deploy (T013) — depende de T009. **Managed Identity
      `id-vovoisabel-deploy` criada, role `Container Apps Contributor` restrita a
      `rg-vovoisabel`, credencial federada `gh-actions-main` criada pro subject
      `repo:FulvioP300/ERPVovoIsabel:ref:refs/heads/main`. Achamos e contornamos um bug de
      tradução de path do Git Bash/MSYS (`--scope "/subscriptions/..."` virava
      `C:/Program Files/Git/subscriptions/...` sem `MSYS_NO_PATHCONV=1`). Falta só cadastrar
      `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID` como secrets do repositório
      no GitHub e criar o Environment `production`.**
- [x] T012 `infra/aca/README.md`: pré-requisitos — **incluindo qual subscription Azure usar
      (nome e ID; `az account list --output table` pra descobrir/confirmar)** —, como rodar
      `provision.sh` apontando pra ela, como configurar a credencial federada (T011), como
      rodar um deploy manual fora do CI se precisar, e como rodar o ambiente de teste local
      (`docker compose up`).

## Fase 5 — Deploy contínuo (só produção)

- [x] T013 Estender `.github/workflows/deploy.yml` (job de deploy, depois do build+push de
      T008): `azure/login` via OIDC (T011) + `az containerapp update --image` em
      `ca-vovoisabel-prod`, atrás de um GitHub Environment `production` com *required
      reviewer* (aprovação manual antes de rodar) — depende de T008, T010, T011. **Ponta a
      ponta pronto: secrets `AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID`
      cadastrados no repositório GitHub; Environment `production` criado, restrito a deploys
      vindos da branch `main` (`deployment_branch_policy` com `custom_branch_policies`,
      já que `main` não é uma branch protegida no GitHub) e com `FulvioP300` como required
      reviewer. Falta só o primeiro push pra `main` pra disparar o pipeline de verdade
      (T015).**

## Fase 6 — Validação

- [x] T014 Smoke test contra a imagem rodando localmente (`docker compose up`, apontando pro
      Mongo/Blob Storage de teste): `GET /api/health` → 200; `GET /` → HTML do frontend;
      `GET /products` via reload direto → HTML do frontend (não 404); `GET /api/rota-inexistente`
      → 404 JSON; login completo (`POST /api/auth/login` → cookie → `GET /api/auth/me`)
      funcionando same-origin; `docker inspect` confirma o `HEALTHCHECK` do container como
      `healthy` — este é o critério de aceite do "ambiente de teste" (spec, seção 8) —
      depende de T004, T006. **Rodado de ponta a ponta com Docker Desktop real (instalado
      nesta sessão). Achou e corrigiu um bug real no `Dockerfile`: `shared/dist/*.d.ts`/`.js`
      importam `zod`, e a resolução de módulos (TS em build, Node em runtime) procura
      `node_modules` subindo a partir de `shared/dist/`, nunca em `backend/node_modules` ou
      `frontend/node_modules` (diretórios irmãos, não ancestrais) — sem copiar também
      `shared/node_modules` pros estágios de backend/frontend/runtime, o build falhava
      (`frontend`) e o runtime teria falhado ao importar shared/dist (`backend`). Corrigido
      copiando `shared/node_modules` nos 3 lugares — funcionava "sem querer" localmente porque
      `shared/node_modules` já existe no disco do desenvolvedor.**
- [ ] T015 Repetir o smoke test de T014 contra a URL pública de `ca-vovoisabel-prod` depois do
      primeiro deploy — confirma TLS automático do ACA, cookies, e que os secrets/env vars
      configurados em T010 estão corretos — depende de T013, T014.

## Fase 7 — Documentação

- [x] T016 `memory/constitution.md` (seção 2): linha "Deploy" na tabela de stack, apontando
      para ADR-015 e para esta spec; versão bumpada para 1.4.
- [x] T017 [ADR-015](../../memory/decisions.md#adr-015--deploy-em-container-único-não-azure-app-service--static-web-apps)
      registrada: troca de estratégia (App Service + Static Web Apps, revertida → container
      único) e o motivo (spec, seção 3).

## Dependências entre tarefas

```
T001 → T002 → T004 → T006 → T014
T003 (independente, só valida T001)
T005 → T006
T007 → T008 (T008 também depende de T004)
T009 → T010, T011 → T012
T008, T010, T011 → T013 → T015 (T015 também depende de T014)
T016, T017 (documentação, já concluídas)
```
