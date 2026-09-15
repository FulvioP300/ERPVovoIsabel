#!/usr/bin/env bash
# Provisiona a infraestrutura Azure Container Apps de PRODUÇÃO (spec 010) — Resource Group,
# Container Apps Environment e o único Container App (`ca-vovoisabel-prod`). Idempotente: pode
# rodar de novo sem duplicar recursos. Rodado manualmente, uma vez (ou quando a topologia
# mudar) — nunca faz parte do pipeline de todo push (isso é o job "deploy" em
# .github/workflows/deploy.yml, que só atualiza a imagem de um Container App já existente).
#
# Uso:
#   AZURE_SUBSCRIPTION_ID=<id-ou-nome> IMAGE=ghcr.io/<owner>/<repo>:latest ./infra/aca/provision.sh
#
# Pré-requisitos: az cli instalado e autenticado (`az login`). Ver infra/aca/README.md.
set -euo pipefail

: "${AZURE_SUBSCRIPTION_ID:?Defina AZURE_SUBSCRIPTION_ID (a subscription Azure com os créditos já existentes — az account list --output table para descobrir) antes de rodar este script.}"
: "${IMAGE:?Defina IMAGE (ex.: ghcr.io/<owner>/<repo>:latest) — a imagem inicial do Container App. Deploys seguintes são feitos pelo workflow de CI/CD, não por este script.}"

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-vovoisabel}"
LOCATION="${LOCATION:-eastus}"
ENVIRONMENT_NAME="${ENVIRONMENT_NAME:-cae-vovoisabel}"
CONTAINER_APP_NAME="${CONTAINER_APP_NAME:-ca-vovoisabel-prod}"

echo "==> Selecionando subscription $AZURE_SUBSCRIPTION_ID"
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
echo "    Subscription ativa: $(az account show --query name -o tsv) ($AZURE_SUBSCRIPTION_ID)"

echo "==> Garantindo a extensão 'containerapp' do az cli"
az extension add --name containerapp --upgrade --only-show-errors >/dev/null 2>&1 || true

echo "==> Resource Group '$RESOURCE_GROUP' (idempotente)"
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

echo "==> Container Apps Environment '$ENVIRONMENT_NAME'"
if az containerapp env show --name "$ENVIRONMENT_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null; then
  echo "    já existe, pulando."
else
  az containerapp env create \
    --name "$ENVIRONMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
fi

echo "==> Container App '$CONTAINER_APP_NAME' (só produção — nenhum outro Container App é criado)"
if az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null; then
  echo "    já existe, pulando criação (para trocar a imagem, use o workflow de deploy, não este script)."
else
  az containerapp create \
    --name "$CONTAINER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT_NAME" \
    --image "$IMAGE" \
    --target-port 8080 \
    --ingress external \
    --min-replicas 1 \
    --max-replicas 3 \
    --cpu 0.25 --memory 0.5Gi \
    --output none
fi

FQDN=$(az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" -o tsv)

cat <<EOF

==> Provisionamento concluído.
    URL pública: https://$FQDN

Próximos passos manuais (ver infra/aca/README.md):
  1. Configurar os secrets do Container App (credenciais de PRODUÇÃO — MONGODB_URI, JWT_*,
     AZURE_STORAGE_CONNECTION_STRING, AI_API_KEY) e as env vars não sensíveis, incluindo
     FRONTEND_URL=https://$FQDN.
  2. Se a imagem em ghcr.io não for pública, configurar credenciais de pull do registro
     (az containerapp registry set).
  3. Configurar a credencial federada OIDC entre o GitHub Actions e uma Managed
     Identity/Service Principal restrita a este Resource Group, e os secrets do repositório
     (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID=$AZURE_SUBSCRIPTION_ID).
EOF
