# Plan 010 — Deploy em Container

**Spec:** [spec.md](spec.md)
**Constituição:** [memory/constitution.md](../../memory/constitution.md)
**Depende de:** todas as specs 001–009 (código já existente a empacotar)

## 1. Stack técnica

| Camada | Tecnologia |
|---|---|
| Container | Docker, build multi-stage, imagem final `node:22-alpine` |
| Servidor de estáticos | `@fastify/static` (mesma família de `@fastify/cors`/`@fastify/cookie` já em uso) |
| CI | GitHub Actions — lint/typecheck/test em todo push/PR; build+push+deploy só em `main` |
| Registro de imagem | GitHub Container Registry (`ghcr.io`) — sem amarrar a um registro específico de nuvem |
| Host de produção | **Azure Container Apps — só 1 Container App (`ca-vovoisabel-prod`)** |
| Dev/test | **Locais** — dev via `npm run dev` (inalterado), test via `docker compose up` local, nenhum recurso de nuvem |
| Deploy no CI | `azure/login` (OIDC, sem segredo de longa duração) + `az containerapp update --image`, só prod, atrás de aprovação manual |

Nenhuma mudança na stack de aplicação (seção 2 da constituição) — só a camada de execução/
empacotamento é nova. `constitution.md` já tem a linha "Deploy" (ADR-015); esta spec detalha
que só produção vai pra nuvem, por custo mínimo.

## 2. Contexto técnico

Hoje `backend/` e `frontend/` são pacotes independentes (cada um com seu `package.json`,
mesmo padrão de `shared/`, ver ADR-011), rodados separadamente em dev (`npm run dev` em cada
um, Vite fazendo proxy de `/api` pro backend) — **isso não muda**. Em produção, o backend
passa a **também** servir o build estático do frontend, tornando os dois pacotes um único
processo de runtime, empacotado como imagem Docker. Essa imagem é usada em dois lugares:
localmente (`docker compose up`, cobre o papel de "ambiente de teste") e no único Container
App de produção do ACA. Diferente da topologia de 3 ambientes já usada para MongoDB Atlas
(ADR-009) e Azure Blob Storage (ADR-003) — o **compute** não replica essa topologia por
completo: só o banco/storage têm um recurso por ambiente; o *runtime* do código só existe na
nuvem para produção.

## 3. Estrutura de arquivos

```
Dockerfile                     # multi-stage: shared → backend → frontend → runtime
.dockerignore                  # node_modules, .env*, dist/, coverage, .git
docker-compose.yml             # serviço único "app" — usado tanto pra smoke test local
                                # quanto como o "ambiente de teste" de fato (seção 8 do spec.md)
docker-compose.example.env     # template das variáveis (mesmas de backend/.env.example),
                                # apontando pro Mongo/Blob Storage de TESTE por padrão

.github/workflows/ci.yml       # lint+typecheck+test em push/PR (backend, frontend, shared)
.github/workflows/deploy.yml   # build+push pra ghcr.io + deploy em ca-vovoisabel-prod
                                # (único Container App), após CI verde + aprovação manual

infra/aca/provision.sh         # az cli idempotente: exige AZURE_SUBSCRIPTION_ID (a
                                # subscription com os créditos já existentes), cria RG,
                                # Container Apps Environment, e o único Container App de
                                # produção — rodado manualmente uma vez, nunca pelo pipeline
                                # de todo push
infra/aca/README.md            # pré-requisitos (az cli, login, IDs de subscription/tenant),
                                # como rodar provision.sh, como configurar OIDC do GitHub Actions

backend/src/
└── plugins/static.plugin.ts   # @fastify/static + fallback SPA, só ativa se o build do
                                # frontend existir no filesystem (produção ou docker compose local)
```

## 4. Fluxo de execução

### 4.1 Build da imagem

```
Dockerfile, estágio "shared-build"
  → npm ci && npm run build (shared/)         → shared/dist

Dockerfile, estágio "backend-build"
  → copia shared/dist do estágio anterior
  → npm ci && npm run build (backend/)         → backend/dist

Dockerfile, estágio "frontend-build"
  → copia shared/dist do estágio "shared-build"
  → npm ci && npm run build (frontend/)        → frontend/dist (estático)

Dockerfile, estágio final "runtime"
  → node:22-alpine, só produção, usuário não-root
  → copia backend/dist, shared/dist, node_modules de produção do backend
  → copia frontend/dist para o caminho que static.plugin.ts espera
  → HEALTHCHECK: GET /api/health
  → CMD node dist/server.js
```

### 4.2 CI/CD (push para `main`, depois de lint/typecheck/test verdes)

```
build docker → push ghcr.io/<owner>/<repo>:<sha>,:latest
  → (GitHub Environment "production", required reviewer — aprovação manual)
  → azure/login (OIDC — client-id/tenant-id/subscription-id como secrets do GitHub, sem
    client-secret de longa duração)
  → az containerapp update --name ca-vovoisabel-prod --image ghcr.io/...:<sha>
```

Um único job de deploy, um único `az containerapp update` — não existe mais fan-out pra
dev/test (removido da versão anterior desta spec, quando ainda havia 3 Container Apps).

### 4.3 Runtime

`server.ts` (inalterado): conecta no MongoDB, sobe o Fastify na porta de `PORT`, host
`0.0.0.0` — já é assim hoje, funciona sem alteração dentro do container, seja local
(`docker compose`) ou no Container App de produção. ACA injeta as variáveis de ambiente/
secrets configuradas no Container App (spec.md, seção 5) antes do processo iniciar; localmente
quem injeta é o `env_file` do `docker-compose.yml`.

## 5. Passos de implementação

### 5.1 Aplicação/imagem

1. `backend/src/plugins/static.plugin.ts`: registra `@fastify/static` apontando pro diretório
   do build do frontend; `setNotFoundHandler` devolve `index.html` para qualquer rota que não
   seja `/api/*` nem um arquivo estático existente (fallback SPA). Só registra o plugin se o
   diretório existir (`fs.existsSync`) — nunca ativa em `npm run dev` local.
2. `Dockerfile` multi-stage (seção 4.1). Usuário não-root no estágio final.
3. `.dockerignore`: nunca copiar `.env`, `node_modules` do host, `dist/` do host, `.git`.
4. `docker-compose.yml` + `docker-compose.example.env` (apontando pro Mongo/Blob Storage de
   **teste** por padrão — é o ambiente de teste de fato, não só uma validação de smoke test).

### 5.2 CI

5. `.github/workflows/ci.yml`: lint + typecheck + test em `shared/`, `backend/`, `frontend/`
   em todo push/PR — reaproveita os mesmos comandos já usados manualmente ao longo do projeto.
6. `.github/workflows/deploy.yml`: build+push da imagem (seção 4.2) + um único job de deploy
   em `ca-vovoisabel-prod`, atrás de *required reviewer* (GitHub Environment "production").

### 5.3 Infraestrutura Azure Container Apps (provisionamento único, manual)

7. Selecionar explicitamente a **subscription Azure** a usar (a que já tem os créditos) —
   `provision.sh` **exige** a variável `AZURE_SUBSCRIPTION_ID` (não usa a subscription default
   do `az login` silenciosamente) e roda `az account set --subscription "$AZURE_SUBSCRIPTION_ID"`
   como primeiro passo, saindo com erro se a variável não estiver setada. Evita o risco de
   provisionar num tenant/subscription errado quando a conta Azure do usuário tem mais de uma
   (ex. uma pessoal com free tier e outra com os créditos que ele já tem).
8. `infra/aca/provision.sh` (az cli, idempotente): cria o Resource Group (se não existir), o
   Container Apps Environment, e **só** o Container App de produção
   (`ca-vovoisabel-prod`) com `minReplicas: 1`, `maxReplicas: 3`, ingress externo na porta de
   `PORT`.
9. Configurar os secrets do Container App de produção (`az containerapp secret set`):
   `mongodb-uri`, `jwt-access-secret`, `jwt-refresh-secret`,
   `azure-storage-connection-string`, `ai-api-key` — credenciais de **produção** (as de
   dev/test continuam só em `.env`/`docker-compose.example.env` locais, nunca no Azure).
   Variáveis não sensíveis (`AZURE_STORAGE_CONTAINER_NAME`, `AI_MODEL`, `AI_BASE_URL`,
   `FRONTEND_URL`) direto como env var, com `FRONTEND_URL` = a própria URL pública que o ACA
   atribui ao Container App.
10. Configurar credencial federada OIDC entre o GitHub Actions (repo + branch `main`) e uma
    Managed Identity/Service Principal do Azure **criada na mesma subscription do passo 7**,
    com permissão restrita só a `Microsoft.App/containerApps/*` no Resource Group (nunca
    `Contributor` na subscription inteira). O ID dessa subscription (`AZURE_SUBSCRIPTION_ID`)
    também vira secret do GitHub Actions, usado pelo `azure/login` no job de deploy (seção 4.2)
    — é o mesmo ID usado manualmente no passo 7, só que consumido pelo CI em vez de digitado à
    mão.

### 5.4 Documentação

11. `infra/aca/README.md`: pré-requisitos (**incluindo qual subscription Azure usar — nome e
    ID, `az account list --output table` pra descobrir/confirmar**), como rodar `provision.sh`
    apontando pra ela, como configurar a credencial federada (passo 10), como rodar um deploy
    manual (`az containerapp update`) fora do CI se precisar, e como rodar o "ambiente de teste"
    local (`docker compose up`).

## 6. Testes planejados

- **Build**: `docker build .` completa sem erro (validação de CI — não há lógica de negócio
  nova nesta spec, só empacotamento).
- **Smoke test/ambiente de teste** contra `docker compose up` local (apontando pro Mongo/Blob
  Storage de teste — este *é* o ambiente de teste, não uma simulação dele):
  - `GET /api/health` → 200.
  - `GET /` → HTML do frontend.
  - `GET /products` (reload direto) → HTML do frontend (fallback SPA), não 404.
  - Login completo (`POST /api/auth/login` → cookie → `GET /api/auth/me`) same-origin.
- Repetir os mesmos checks contra a URL pública de `ca-vovoisabel-prod` depois do primeiro
  deploy — confirma TLS automático, cookies, e secrets configurados corretamente.
- Nenhum teste unitário/integração novo nos pacotes (`backend`/`frontend`/`shared`) — esta
  spec não adiciona regra de negócio; a suíte existente (117 testes backend, E2E) continua
  sendo a garantia de correção funcional.

## 7. Riscos / decisões em aberto

- **`infra/aca/provision.sh` via `az cli` puro, não Bicep/Terraform** — decisão deliberada de
  simplicidade (constituição, princípio V) para 1 Container App; reavaliar só se a
  infraestrutura Azure do projeto crescer além disso.
- `@fastify/static` é uma dependência nova do backend — avaliar na implementação se cobre bem
  o fallback SPA (rotas aninhadas do React Router) sem lógica manual extra.
- Configuração exata do OIDC federado (GitHub Actions ↔ Azure AD) depende de decisões de
  acesso da conta Azure do usuário — documentar passo a passo em `infra/aca/README.md` na
  implementação, já que não posso provisionar isso por conta própria.
- Se algum dia fizer sentido ter um ambiente de teste acessível remotamente (não só na máquina
  de quem está testando — ex. QA de outra pessoa, demo pra terceiros), a topologia original de
  3 Container Apps (versão anterior desta spec) fica como referência de como escalar essa
  decisão sem redesenhar a estratégia — não é o caso hoje.
