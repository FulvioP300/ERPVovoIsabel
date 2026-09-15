# Spec 010 — Deploy em Container

**Domínio:** Infraestrutura / Operações
**Fase:** 1 — Backoffice (habilita colocar o MVP em produção)
**Status:** Draft
**Depende de:** todas as specs de domínio (001–009) — esta spec empacota o que já existe,
não adiciona funcionalidade de produto.

## 1. Visão geral

Definir como o ERP roda em produção: **um único container Docker**, contendo backend
(Fastify) e frontend (build estático do React) no mesmo processo/porta. Substitui a tentativa
anterior (Azure App Service + Static Web Apps como dois serviços separados, revertida — ver
[ADR-015](../../memory/decisions.md#adr-015--deploy-em-container-único-não-azure-app-service--static-web-apps))
por uma estratégia independente de provedor no nível da **imagem**: ela roda sem alteração em
qualquer host que execute containers Docker.

**Só produção vai pra nuvem.** Dev e test rodam **localmente** — dev via `npm run dev` (já é
assim hoje, sem Docker, inalterado) e test via `docker compose up` local (a mesma imagem que
vai pra produção, validada na máquina antes de qualquer deploy). O **Azure Container Apps**
(ACA) hospeda só o Container App de produção — decisão de custo mínimo (seção 2): nenhum
recurso de nuvem pago é provisionado só pra dev/test.

MongoDB Atlas e Azure Blob Storage **continuam exatamente como estão** (ADR-009, ADR-003,
incluindo os clusters/containers de dev e teste, que continuam existindo e sendo usados —
**só o compute que roda o código é que deixa de existir na nuvem pra dev/test**, o banco e o
storage de cada ambiente continuam nos mesmos lugares de sempre).

## 2. Por que só produção no Azure Container Apps

- **Custo mínimo**: dev/test não geram nenhuma cobrança de compute na nuvem — só rodam na
  máquina de quem está desenvolvendo/testando, US$ 0 de Azure Container Apps para esses dois
  ambientes. Só existe 1 Container App (prod) na subscription.
- **Sem código específico de plataforma**: ACA só recebe a imagem já pronta (`docker build` +
  `docker push`) e injeta variáveis de ambiente — a aplicação não sabe nem precisa saber que
  está rodando em ACA. Continua sendo possível rodar a mesma imagem em outro host amanhã sem
  mudar uma linha de código.
- **TLS/HTTPS gerenciado automaticamente** pela borda do ACA em produção.
- **`minReplicas: 1` só em produção** (evita cold start pro uso diário real do backoffice) —
  não há decisão de scale-to-zero a fazer pra dev/test porque eles simplesmente não rodam lá.
- **Mesmo modelo de segredos** já usado no resto do projeto: variáveis de ambiente injetadas
  em runtime (constituição, princípio VII) — em produção, secrets do Container App; em
  dev/test local, o `.env`/`docker-compose.example.env` já usados hoje.

## 3. Motivação (por que não dois serviços gerenciados separados)

A tentativa anterior hospedava frontend e backend em domínios/origens diferentes (Static Web
Apps + App Service), o que exige cookies de sessão `SameSite=None; Secure` para funcionar
cross-origin — mais frágil e mais fácil de quebrar silenciosamente (ex.: em iframes, alguns
navegadores/extensões, ambientes de teste) do que cookies `SameSite=Lax` same-origin já usados
em dev. Também exigia que o frontend soubesse a URL absoluta do backend em tempo de build
(`frontend/src/config.ts` na tentativa anterior), quebrando o proxy relativo (`/api/...`) que
funciona identicamente em dev (proxy do Vite) e em produção (mesmo processo) na estratégia
desta spec.

Consolidar num único container elimina a origem cruzada inteiramente: cookies, CORS e chamadas
`fetch("/api/...")` funcionam sem nenhuma configuração condicional por ambiente.

## 4. Estratégia (imagem)

```
┌─────────────────────────────────────────┐
│ Container único (imagem Docker)          │
│                                           │
│  Fastify (porta única, ex. 8080)         │
│   ├── /api/*        → rotas da API       │
│   ├── /api/health    → healthcheck        │
│   └── /* (demais)   → build estático do   │
│                        frontend (SPA,     │
│                        fallback index.html)│
└─────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   MongoDB Atlas      Azure Blob Storage
   (externo,          (externo,
   MONGODB_URI)       AZURE_STORAGE_*)
```

- Build multi-stage: compila `shared/`, `backend/` e `frontend/` em estágios separados;
  imagem final só tem o runtime Node.js + os artefatos compilados (`backend/dist`,
  `shared/dist`, `frontend/dist`) — nunca código-fonte TypeScript nem `devDependencies`.
- Backend serve o build do frontend como arquivos estáticos (`@fastify/static`), registrado
  **depois** das rotas de API — qualquer caminho que não bata com `/api/*` nem com um arquivo
  estático real cai no fallback SPA (`index.html`), para as rotas client-side do React Router
  funcionarem em reload direto (ex. `/products/123`).
- **A mesma imagem** serve os três propósitos, cada um num lugar diferente:
  - **dev**: nem usa a imagem — `npm run dev` de cada pacote, Vite com proxy pra `/api`,
    exatamente como hoje (nenhuma mudança no dia a dia de desenvolvimento).
  - **test**: `docker compose up` **local** — a imagem de verdade, rodando na máquina de quem
    está validando, apontando pro Mongo/Blob Storage do ambiente de teste (mesmas credenciais
    já usadas pelo e2e hoje).
  - **prod**: a mesma imagem, publicada em `ghcr.io` e rodando no único Container App do ACA.

## 5. Topologia no Azure Container Apps

Só produção. Nenhum Container App de dev ou test é provisionado.

```
Subscription Azure: <a subscription com os créditos já existentes do usuário — ver plan.md, seção 5.3>
└── Resource Group: rg-vovoisabel
    └── Container Apps Environment: cae-vovoisabel
        └── Container App: ca-vovoisabel-prod   → aponta pro Mongo/Blob de produção
```

A subscription **não é fixada nesta spec** — é um dado da conta Azure do usuário, informado no
momento do provisionamento (`AZURE_SUBSCRIPTION_ID`, exigido por `provision.sh`; plan.md, seção
5.3) e depois reaproveitado como secret do GitHub Actions para o deploy contínuo (seção 7).
Todos os recursos desta spec (Resource Group, Container Apps Environment, o Container App de
produção, a Managed Identity do OIDC) vivem **na mesma subscription** — nunca espalhados entre
subscriptions diferentes.

- **Ingress**: externo, HTTPS, porta alvo = `PORT` da aplicação (ex. 8080). URL pública
  `https://ca-vovoisabel-prod.<region>.azurecontainerapps.io` (domínio customizado fora de
  escopo nesta fase).
- **Secrets do Container App** (não plain env var) para tudo sensível: `MONGODB_URI`,
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AZURE_STORAGE_CONNECTION_STRING`, `AI_API_KEY` —
  as credenciais de **produção** apenas. Variáveis não sensíveis (`NODE_ENV`, `PORT`,
  `AI_MODEL`, `AI_BASE_URL`, `AZURE_STORAGE_CONTAINER_NAME`, `FRONTEND_URL`) como env var
  normal.
- **Escala**: `minReplicas: 1` / `maxReplicas: 3` — evita cold start (conexão nova ao Mongo a
  cada scale-up) no uso diário real do backoffice. Scale-to-zero em produção fica fora de
  escopo (o objetivo de custo mínimo já foi alcançado tirando dev/test da nuvem — zerar prod
  também trocaria confiabilidade por uma economia marginal, não vale a pena aqui).
- **Registro de imagem**: `ghcr.io` — ACA suporta pull de registros externos via secret de
  autenticação; não é necessário Azure Container Registry.

## 6. Variáveis de ambiente em runtime

Nenhuma nova variável além das que já existem em `backend/.env.example` — a imagem não embute
nenhum segredo; todas são injetadas em runtime, uma vez por ambiente:

```
NODE_ENV, PORT
MONGODB_URI                                          [secret em prod]
JWT_ACCESS_SECRET, JWT_REFRESH_SECRET                [secret em prod]
AZURE_STORAGE_CONNECTION_STRING                      [secret em prod]
AZURE_STORAGE_CONTAINER_NAME
AI_API_KEY                                           [secret em prod]
AI_BASE_URL, AI_MODEL, AI_ANALYZE_RATE_LIMIT (opcional)
FRONTEND_URL  — em prod, a própria URL pública do Container App (same-origin); em test local,
               http://localhost:<porta mapeada>
```

- **dev**: `backend/.env` local (já existe).
- **test**: `docker-compose.example.env` → cópia local `.env` (não versionado), apontando pro
  Mongo/Blob Storage de teste.
- **prod**: secrets/env vars do Container App (seção 5) — nunca um arquivo `.env` na imagem.

`frontend/` não recebe nenhuma variável de ambiente de build (nada de `VITE_API_URL` ou
similar) — o same-origin torna isso desnecessário, e evita reintroduzir o problema da seção 3.

## 7. Build, publicação e deploy (CI/CD)

```
push/PR → GitHub Actions
   → instala dependências, roda lint + typecheck + testes (backend, frontend, shared)
   → (só em push para main, CI verde)
       → build da imagem Docker multi-stage
       → publica em ghcr.io/<owner>/<repo>:<sha> e :latest
       → (GitHub Environment "production", required reviewer — aprovação manual)
       → autentica no Azure via OIDC (azure/login, sem segredo de longa duração no GitHub)
       → az containerapp update --name ca-vovoisabel-prod --image ghcr.io/...:<sha>
```

Não existe passo de deploy automático pra dev/test — eles não têm recurso de nuvem pra
atualizar. Validar a imagem localmente (`docker compose up`, seção 8) é o que hoje seria
"deploy em test".

Provisionamento inicial dos recursos ACA (Resource Group, Container Apps Environment, o
Container App de produção, secrets) é feito **uma vez**, via `az cli` documentado (`plan.md`)
— não faz parte do pipeline de todo push.

## 8. Critérios de aceite

- `docker build` a partir da raiz do monorepo produz uma imagem que, ao rodar com as variáveis
  de ambiente corretas, sobe a API e serve o frontend na mesma porta.
- `docker compose up` local sobe a imagem apontando pro Mongo/Blob Storage de **teste** e
  funciona de ponta a ponta (login, cadastro de produto) — esse é o critério de "ambiente de
  teste", sem nenhum recurso Azure provisionado pra isso.
- Acessar a raiz (`/`) da imagem em execução retorna o HTML do frontend; acessar uma rota
  client-side (ex. `/products`) direto (reload) também retorna o HTML do frontend (fallback
  SPA), não um 404 — validado local e na URL pública do Container App de produção.
- `GET /api/health` responde `200` sem depender de MongoDB estar acessível (mesmo
  comportamento já implementado) — usado como healthcheck do Container App.
- Login funciona de ponta a ponta contra a imagem local e contra o Container App de produção,
  incluindo cookies de sessão — sem nenhuma configuração de CORS/cookie condicional por
  ambiente.
- Nenhum segredo (`.env`, chaves, connection strings) é copiado para dentro da imagem nem
  aparece em plain env var do Container App — tudo sensível é secret do ACA.
- Deploy em `ca-vovoisabel-prod` exige aprovação manual no GitHub Actions antes de rodar —
  nunca automático no primeiro push verde.
- **Nenhum Container App de dev ou test existe na subscription** — só `ca-vovoisabel-prod`.

## 9. Fora de escopo

- Dev/test hospedados no Azure Container Apps (ou qualquer nuvem) — decisão de custo mínimo
  desta spec; ambos rodam localmente (seção 4).
- Orquestração multi-container/Kubernetes — o ACA já abstrai isso pra produção.
- Domínio customizado e certificado próprio — usa o domínio padrão
  `*.azurecontainerapps.io` nesta fase.
- CDN/edge caching do frontend — o container serve os estáticos diretamente; suficiente para o
  volume esperado do MVP.
- Scale-to-zero em produção — trocaria confiabilidade por economia marginal (seção 5).
- Infraestrutura como código (Bicep/Terraform) — provisionamento inicial via `az cli`
  documentado é suficiente para 1 Container App; reavaliar se a infraestrutura crescer.

## 10. Conformidade constitucional

Princípio V (simplicidade — um único container, um único Container App, sem orquestração/IaC
nova, e o custo de nuvem restrito ao mínimo necessário: só produção). Princípio VI
(integrações externas abstraídas — MongoDB/Blob/IA continuam por trás de suas portas,
inalterados por esta spec, em todos os ambientes incluindo dev/test locais). Princípio VII
(segurança): secrets do ACA para tudo sensível em produção, OIDC em vez de segredo de longa
duração no GitHub Actions, TLS automático na borda, deploy em produção com aprovação manual —
same-origin elimina a necessidade de `SameSite=None`, reduzindo a superfície de configuração
insegura por ambiente.
