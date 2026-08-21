# Spec 008 — Auditoria

**Domínio:** Audit
**Fase:** 1 — Backoffice
**Status:** Draft
**Depende de:** [001-autenticacao](../001-autenticacao/spec.md)

## 1. Visão geral

Registro append-only de operações sensíveis realizadas no sistema, para rastreabilidade e
futura visualização por administradores.

## 2. Modelo de dados

Collection `audit_logs`:

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "action": "PRODUCT_UPDATE",
  "entity": "product",
  "entityId": "ObjectId",
  "timestamp": "ISODate",
  "metadata": {
    "field": "preco.preco_venda",
    "oldValue": 129.90,
    "newValue": 119.90
  }
}
```

## 3. Operações auditáveis (mínimo obrigatório)

```
LOGIN_SUCCESS, LOGIN_FAILED
USER_CREATE, USER_UPDATE, USER_DISABLE
PRODUCT_CREATE, PRODUCT_UPDATE, PRODUCT_DISABLE, PRODUCT_PUBLISH, PRODUCT_SOLD
PRICE_UPDATE
CATEGORY_CREATE, CATEGORY_UPDATE, CATEGORY_DISABLE
```

## 4. Regras de negócio

- Todo registro de auditoria é gerado no backend, na mesma transação lógica da operação que
  o originou — nunca inferido posteriormente a partir de logs de aplicação genéricos.
- Registros de auditoria são imutáveis: não há update nem delete sobre `audit_logs`.
- Visualização de auditoria é restrita a `role = admin` (ver
  [002-usuarios](../002-usuarios/spec.md)).
- `PRICE_UPDATE` deve sempre registrar `oldValue`/`newValue` em `metadata`.

## 5. Critérios de aceite

- Uma tentativa de login falha gera exatamente um registro `LOGIN_FAILED` com o `userId`
  correspondente quando o e-mail existe, ou sem `userId` quando não existe (sem revelar
  existência do e-mail na resposta ao cliente — ver [001-autenticacao](../001-autenticacao/spec.md)).
- Uma alteração de preço de produto gera um registro `PRICE_UPDATE` com valores antigo e
  novo.
- Um usuário `operator` não consegue acessar a listagem de auditoria (`403`).

## 6. Fora de escopo

Exportação de auditoria, alertas automáticos sobre eventos suspeitos, retenção configurável —
evoluções futuras.

## 7. Conformidade constitucional

Implementa o princípio IX (auditoria de operações sensíveis) da
[constituição](../../memory/constitution.md).
