#!/usr/bin/env bash
# Reverte ca-vovoisabel-prod para uma imagem JÁ publicada em ghcr.io — sem rebuild, sem
# esperar CI/CD, sem aprovação manual (rollback é justamente pra quando não dá pra esperar
# isso). Recebe uma tag git, branch ou SHA; a imagem correspondente já existe no registro
# porque o workflow de deploy (.github/workflows/deploy.yml) publica
# ghcr.io/<owner>/<repo>:<sha-completo do commit> em todo deploy aprovado.
#
# Funciona de verdade só para commits que JÁ foram deployados (tiveram um "Approve and
# deploy" aceito no GitHub Actions em algum momento) — nem todo commit tem imagem publicada.
# Por isso o uso pretendido é reverter pra uma tag git criada deliberadamente num estado
# estável conhecido (ex.: v1.0.0), não pra qualquer SHA aleatório do histórico.
#
# Uso:
#   AZURE_SUBSCRIPTION_ID=<id-ou-nome> ./infra/aca/rollback.sh v1.0.0
#   AZURE_SUBSCRIPTION_ID=<id-ou-nome> ./infra/aca/rollback.sh <sha-do-commit>
set -euo pipefail

: "${AZURE_SUBSCRIPTION_ID:?Defina AZURE_SUBSCRIPTION_ID (az account list --output table) antes de rodar este script.}"

REF="${1:?Uso: rollback.sh <tag-ou-sha-ou-branch> — ex.: rollback.sh v1.0.0}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-vovoisabel}"
CONTAINER_APP_NAME="${CONTAINER_APP_NAME:-ca-vovoisabel-prod}"
REPO_LOWER="${REPO_LOWER:-fulviop300/erpvovoisabel}"

# "^{commit}" desreferencia tags anotadas pro commit real — sem isso, git rev-parse numa tag
# anotada devolve o SHA do OBJETO DA TAG (nunca publicado como tag de imagem), não do commit.
SHA=$(git rev-parse "$REF^{commit}")
IMAGE="ghcr.io/$REPO_LOWER:$SHA"

echo "==> Selecionando subscription $AZURE_SUBSCRIPTION_ID"
az account set --subscription "$AZURE_SUBSCRIPTION_ID"

echo "==> Revertendo $CONTAINER_APP_NAME para $IMAGE"
echo "    (ref: $REF -> commit $SHA)"
az containerapp update \
  --name "$CONTAINER_APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --image "$IMAGE"

FQDN=$(az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" -o tsv)

echo
echo "==> Comando aceito. Confirme a saúde da aplicação em alguns segundos:"
echo "    curl https://$FQDN/api/health"
echo
echo "Se a imagem não existir em ghcr.io para este ref (ex.: um commit que nunca teve um"
echo "deploy aprovado), o comando acima é aceito mas a nova revisão falha ao subir (pull da"
echo "imagem falha) — confira 'az containerapp revision list' e os logs; nesse caso rode o"
echo "script de novo com um ref que você sabe que já foi deployado (ex.: a tag anterior)."
