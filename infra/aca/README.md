# Infraestrutura Azure Container Apps (produção)

Spec: [specs/010-deploy](../../specs/010-deploy/spec.md) · Plan: [plan.md](../../specs/010-deploy/plan.md)

Só produção roda na Azure. Dev roda local (`npm run dev`, inalterado) e test roda local via
`docker compose up` (ver raiz do repo: `docker-compose.yml` + `docker-compose.example.env`) —
nenhum recurso de nuvem é provisionado pra esses dois ambientes.

## Pré-requisitos

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) instalado e autenticado
  (`az login`).
- **Qual subscription usar**: a subscription Azure com os créditos que você já tem — não é
  fixada em nenhuma spec, é um dado da sua conta. Descubra o nome/ID com:

  ```sh
  az account list --output table
  ```

  Guarde o `SubscriptionId` da linha correta — é o valor de `AZURE_SUBSCRIPTION_ID` usado em
  todos os passos abaixo.
- Permissão para criar Resource Group, Container Apps Environment e Container App nessa
  subscription (role `Contributor` na subscription, ou equivalente já concedido nela).
- Acesso de push ao GitHub Container Registry (`ghcr.io/<owner>/<repo>`) — normalmente já
  concedido automaticamente pelo `GITHUB_TOKEN` do próprio Actions (ver
  `.github/workflows/deploy.yml`).

## 1. Provisionar os recursos (uma vez)

```sh
AZURE_SUBSCRIPTION_ID=<id-ou-nome-da-subscription> \
IMAGE=ghcr.io/<owner>/<repo>:latest \
./infra/aca/provision.sh
```

Cria (ou reaproveita, se já existirem — o script é idempotente):

```
Subscription <AZURE_SUBSCRIPTION_ID>
└── Resource Group: rg-vovoisabel
    └── Container Apps Environment: cae-vovoisabel
        └── Container App: ca-vovoisabel-prod   (só este — nenhum de dev/test)
```

Ao final, o script imprime a URL pública (`https://ca-vovoisabel-prod.<region>.azurecontainerapps.io`).
Guarde essa URL — é o valor de `FRONTEND_URL` no passo 2.

Se a imagem `ghcr.io/<owner>/<repo>` for **privada**, o Container App precisa de credenciais
pra puxar dela:

```sh
az containerapp registry set \
  --name ca-vovoisabel-prod \
  --resource-group rg-vovoisabel \
  --server ghcr.io \
  --username <seu usuário do GitHub> \
  --password <um Personal Access Token com escopo read:packages>
```

Alternativa mais simples: tornar o pacote público nas configurações do GHCR (Settings →
Package settings → Change visibility) — a imagem não contém segredo nenhum (spec 010, critério
de aceite), então isso é seguro.

## 2. Configurar os secrets de produção

Credenciais de **produção** apenas — as de dev/test nunca tocam o Azure, continuam só em
`backend/.env` / `docker-compose.example.env` locais.

```sh
az containerapp secret set \
  --name ca-vovoisabel-prod \
  --resource-group rg-vovoisabel \
  --secrets \
    mongodb-uri="<MONGODB_URI de produção>" \
    jwt-access-secret="<segredo forte, só de produção>" \
    jwt-refresh-secret="<segredo forte, só de produção>" \
    azure-storage-connection-string="<connection string da Storage Account>" \
    ai-api-key="<chave do provedor de IA>"

az containerapp update \
  --name ca-vovoisabel-prod \
  --resource-group rg-vovoisabel \
  --set-env-vars \
    "MONGODB_URI=secretref:mongodb-uri" \
    "JWT_ACCESS_SECRET=secretref:jwt-access-secret" \
    "JWT_REFRESH_SECRET=secretref:jwt-refresh-secret" \
    "AZURE_STORAGE_CONNECTION_STRING=secretref:azure-storage-connection-string" \
    "AI_API_KEY=secretref:ai-api-key" \
    "NODE_ENV=production" \
    "PORT=8080" \
    "AZURE_STORAGE_CONTAINER_NAME=product-images-prod" \
    "AI_MODEL=<ex.: gpt-4o-mini>" \
    "AI_BASE_URL=<endpoint do provedor, se não for a OpenAI oficial>" \
    "FRONTEND_URL=<a URL pública impressa no passo 1>"
```

> `--set-env-vars` aceita tanto `NOME=valor` quanto `NOME=secretref:<nome-do-secret>` na mesma
> lista — é assim que os 5 valores sensíveis viram env var sem nunca aparecer em texto puro na
> configuração do Container App. Sintaxe pode variar levemente por versão do az cli — confira
> `az containerapp update --help` se o comando acima não bater com a versão instalada.

## 3. Configurar o deploy contínuo (OIDC do GitHub Actions)

O workflow `.github/workflows/deploy.yml` autentica no Azure via OIDC — sem client-secret de
longa duração armazenado no GitHub. Passos (uma vez):

```sh
# 1. Cria uma Managed Identity dedicada
az identity create \
  --name id-vovoisabel-deploy \
  --resource-group rg-vovoisabel

CLIENT_ID=$(az identity show --name id-vovoisabel-deploy --resource-group rg-vovoisabel --query clientId -o tsv)
PRINCIPAL_ID=$(az identity show --name id-vovoisabel-deploy --resource-group rg-vovoisabel --query principalId -o tsv)

# 2. Restringe a permissão só a Container Apps DESTE Resource Group — nunca Contributor na
#    subscription inteira.
az role assignment create \
  --assignee-object-id "$PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "Container Apps Contributor" \
  --scope "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/rg-vovoisabel"

# 3. Credencial federada — confia em runs do GitHub Actions deste repo, branch main
az identity federated-credential create \
  --name gh-actions-main \
  --identity-name id-vovoisabel-deploy \
  --resource-group rg-vovoisabel \
  --issuer "https://token.actions.githubusercontent.com" \
  --subject "repo:<owner>/<repo>:ref:refs/heads/main" \
  --audiences "api://AzureADTokenExchange"
```

Depois, em GitHub → Settings → Secrets and variables → Actions, cadastre:

| Secret | Valor |
|---|---|
| `AZURE_CLIENT_ID` | `$CLIENT_ID` acima |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | a mesma subscription do passo 1 |

E em GitHub → Settings → Environments, crie o Environment `production` com **required
reviewer** habilitado — é isso que torna o deploy uma aprovação manual (o workflow já referencia
`environment: production`).

## Deploy manual (fora do CI, se precisar)

```sh
az account set --subscription "<AZURE_SUBSCRIPTION_ID>"
az containerapp update \
  --name ca-vovoisabel-prod \
  --resource-group rg-vovoisabel \
  --image ghcr.io/<owner>/<repo>:<tag-ou-sha>
```

## Rodando o "ambiente de teste" local

Não usa nada deste diretório — é local, via Docker Compose, na raiz do repo:

```sh
cp docker-compose.example.env .env
# editar .env com as credenciais de TESTE (Mongo Atlas/Blob Storage de teste)
docker compose up --build
```

Sobe a mesma imagem que vai pra produção em `http://localhost:8080`. Ver spec 010, seção 8,
para os critérios de aceite desse ambiente.
