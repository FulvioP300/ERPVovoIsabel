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

**Liberar o IP de saída no MongoDB Atlas (Network Access)** — sem isso, o container conecta no
Mongo e a conexão é recusada na camada TLS (`SSL alert internal error` nos logs, via
`az containerapp logs show`), o servidor nunca sobe e todo request trava/dá timeout. O Container
Apps Environment (plano Consumption, sem VNET dedicada) não garante formalmente um IP de saída
fixo, mas expõe um IP estático do Environment que na prática também é usado como saída:

```sh
az containerapp env show --name cae-vovoisabel --resource-group rg-vovoisabel \
  --query "properties.staticIp" -o tsv
```

Adicione esse IP (`/32`) no Atlas → Project de produção → **Network Access** → **IP Access
List**. Se mesmo assim a conexão falhar (o IP de saída real pode não coincidir com o `staticIp`
em todo cenário), o log do container mostra os hosts do shard que ele tentou alcançar — nesse
caso, ou amplia a faixa liberada no Atlas, ou libera `0.0.0.0/0` como fallback (a autenticação
usuário/senha + TLS continua protegendo a conexão), ou investe em VNET + NAT Gateway pra um IP
de saída garantido (custo e complexidade extra, fora do escopo desta spec).

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

# 3. Credencial federada — confia em runs do GitHub Actions deste repo que rodam sob o
#    Environment "production". IMPORTANTE: o subject NÃO é "ref:refs/heads/main" — um job que
#    referencia `environment:` no workflow (como o job "deploy" em deploy.yml) faz o GitHub
#    emitir o token OIDC com subject no formato "environment:<nome>", não "ref:refs/heads/...".
#    Usar o subject errado (ref:refs/heads/main) falha com AADSTS700213 "No matching federated
#    identity record found" — foi exatamente esse o erro no primeiro deploy real desta spec.
#
#    Além disso: contas/repos com "immutable subject claims" habilitado (GitHub inclui os IDs
#    numéricos imutáveis do owner/repo no subject, não só os nomes) precisam do subject exato
#    "repo:<owner>@<owner_id>/<repo>@<repo_id>:environment:production" — o erro AADSTS700213
#    traz o subject exato que o GitHub tentou usar, copie dali em vez de adivinhar. Foi
#    necessário aqui: "repo:FulvioP300@248797478/ERPVovoIsabel@1341397627:environment:production".
az identity federated-credential create \
  --name gh-actions-main \
  --identity-name id-vovoisabel-deploy \
  --resource-group rg-vovoisabel \
  --issuer "https://token.actions.githubusercontent.com" \
  --subject "repo:<owner>/<repo>:environment:production" \
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

## 4. Domínio customizado (opcional)

A URL padrão do ACA (`https://ca-vovoisabel-prod.<region>.azurecontainerapps.io`) sempre
funciona — este passo é só pra apontar um domínio próprio (ex.: `sistema.vovoisabel.com.br`)
pra ela, com certificado TLS **gerenciado automaticamente pela Azure** (grátis, renovação
automática). Cobre só o hostname exato configurado — **não é wildcard**; múltiplos
subdomínios exigiriam repetir o processo pra cada um, ou trazer um certificado wildcard
próprio (fora do que a Azure emite automaticamente).

```sh
# 1. Pegue o ID de verificação do domínio
az containerapp show --name ca-vovoisabel-prod --resource-group rg-vovoisabel \
  --query "properties.customDomainVerificationId" -o tsv
```

No DNS do seu domínio (fora da Azure — no seu provedor/registrador), adicione:

| Tipo | Nome | Valor |
|---|---|---|
| `TXT` | `asuid.<subdominio>` | o ID de verificação do passo 1 |
| `CNAME` | `<subdominio>` | `ca-vovoisabel-prod.<region>.azurecontainerapps.io` |

Espere propagar (minutos a algumas horas; confirme com `nslookup -type=TXT
asuid.<subdominio>.<dominio>` e `nslookup <subdominio>.<dominio>` antes de continuar) e então:

```sh
# 2. Adiciona o hostname ao Container App
az containerapp hostname add \
  --hostname <subdominio>.<dominio> \
  --name ca-vovoisabel-prod \
  --resource-group rg-vovoisabel

# 3. Vincula o certificado gerenciado — pode levar mais que os "até 20 minutos" que a Azure
#    avisa; acompanhe com o comando de baixo em vez de confiar só no spinner do CLI
az containerapp hostname bind \
  --hostname <subdominio>.<dominio> \
  --name ca-vovoisabel-prod \
  --resource-group rg-vovoisabel \
  --environment cae-vovoisabel \
  --validation-method CNAME

# Acompanhar o progresso da emissão (Pending → Succeeded)
az containerapp env certificate list --name cae-vovoisabel --resource-group rg-vovoisabel \
  --query "[].properties.provisioningState" -o tsv
```

Por fim, atualize `FRONTEND_URL` pro domínio novo (afeta CORS/origem, mesmo em uma app
same-origin):

```sh
az containerapp update --name ca-vovoisabel-prod --resource-group rg-vovoisabel \
  --set-env-vars "FRONTEND_URL=https://<subdominio>.<dominio>"
```

## Deploy manual (fora do CI, se precisar)

```sh
az account set --subscription "<AZURE_SUBSCRIPTION_ID>"
az containerapp update \
  --name ca-vovoisabel-prod \
  --resource-group rg-vovoisabel \
  --image ghcr.io/<owner>/<repo>:<tag-ou-sha>
```

## Rollback rápido pra uma versão estável conhecida

O Container App está no modo de revisão **`Single`** (`az containerapp show ... --query
properties.configuration.activeRevisionsMode`) — a revisão anterior é descartada
automaticamente a cada deploy, então **não dá pra confiar no próprio Azure** pra guardar uma
versão antiga pronta pra voltar via troca de tráfego entre revisões (não usamos `Multiple`
de propósito: manter revisões antigas ativas consome réplica própria, custo contínuo que
contraria a decisão de custo mínimo desta spec).

A estratégia adotada: marcar commits estáveis conhecidos com uma **tag git anotada** (ex.:
`v1.0.0`, criada depois de confirmar que aquele commit está rodando bem em produção) — a
imagem Docker daquele commit já está publicada em `ghcr.io` (todo deploy aprovado publica
`ghcr.io/<owner>/<repo>:<sha-completo>`), então reverter é só reapontar o Container App pra
ela, sem rebuild e sem esperar CI/CD:

```sh
git tag -a v1.1.0 <sha-ou-branch> -m "descrição do que valida essa versão como estável"
git push origin v1.1.0   # tags não disparam CI/CD (só push de branch dispara) — seguro
```

Rollback, usando o script (`infra/aca/rollback.sh`):

```sh
AZURE_SUBSCRIPTION_ID=<id-ou-nome> ./infra/aca/rollback.sh v1.0.0
```

O script resolve a tag/branch/SHA pro commit real (cuidado: `git rev-parse` numa tag anotada
sozinho devolve o SHA do *objeto da tag*, não do commit — o script já usa `^{commit}` pra
desreferenciar corretamente) e roda o `az containerapp update --image` direto, sem passar
pela aprovação manual do GitHub Actions — rollback é justamente pra quando não dá pra esperar
isso.

**Limitação**: só funciona para commits que já tiveram um deploy aprovado antes (a imagem
precisa existir em `ghcr.io`) — não é rollback pra qualquer commit do histórico, só pros que
foram deliberadamente marcados como estáveis.

## Rodando o "ambiente de teste" local

Não usa nada deste diretório — é local, via Docker Compose, na raiz do repo:

```sh
cp docker-compose.example.env .env
# editar .env com as credenciais de TESTE (Mongo Atlas/Blob Storage de teste)
docker compose up --build
```

Sobe a mesma imagem que vai pra produção em `http://localhost:8080`. Ver spec 010, seção 8,
para os critérios de aceite desse ambiente.
