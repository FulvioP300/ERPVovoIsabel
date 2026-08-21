# Tasks 005 — Produtos: Modelo, Cadastro Manual e Administração

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [003-categorias/tasks.md](../003-categorias/tasks.md),
[004-sku/tasks.md](../004-sku/tasks.md), [002-usuarios/tasks.md](../002-usuarios/tasks.md)
(`authorize.middleware.ts`)
**Convenção:** `[P]` = tarefa paralelizável.

## Fase 1 — Schema compartilhado (bloco fundacional)

- [ ] T001 Implementar `shared/schemas/product.schema.ts`: schema Zod completo (todas as
      subseções do modelo — identificacao, classificacao, marca, caracteristicas, medidas,
      condicao, preco, estoque, imagens, ecommerce, marketplaces, venda, ai_metadata,
      auditoria) com `.superRefine` para a regra `possui_defeitos = true ⇒
      defeitos.length >= 1`.
- [ ] T002 [P] Teste unitário `shared/schemas/product.schema.test.ts`: aceita produto válido;
      rejeita `possui_defeitos=true` com `defeitos=[]`; campos desconhecidos pela IA aceitam
      `null` (não `undefined` implícito).

## Fase 2 — Testes de integração e domínio

- [ ] T003 [P] Teste unitário `backend/src/services/product.service.test.ts`: transição de
      `status` inválida (ex. `vendido → rascunho`) é rejeitada; transição válida
      (`rascunho → em_revisao → disponivel → reservado → vendido`) é aceita; `inativo`
      alcançável a partir de qualquer estado.
- [ ] T004 Teste de integração `backend/tests/integration/products.spec.ts`:
      `POST /api/products` gera `sku` via 004 e persiste; `DELETE /api/products/:id` realiza
      soft-delete (`status=inativo`, documento continua existindo); filtros combinados
      (categoria+status+tamanho) retornam o resultado esperado.

## Fase 3 — Implementação core (backend)

- [ ] T005 `backend/src/schemas/product.schema.ts`: re-exporta/estende
      `shared/schemas/product.schema.ts` — depende de T001.
- [ ] T006 Implementar `backend/src/repositories/product.repository.ts`
      (`list({filtros,paginacao,ordenacao})`, `findById`, `create`, `update`, `softDelete`).
- [ ] T007 Implementar `backend/src/services/product-search.service.ts` (monta filtro
      MongoDB a partir de query params: SKU, nome, categoria, subcategoria, departamento,
      marca, tamanho, cor, estado, status, faixa de preço, data de cadastro) — depende de
      T006.
- [ ] T008 Implementar `backend/src/services/product.service.ts`: cria produto chamando
      `category.service.assertCategoryActive` (003) e `sku.service.generateNextSku` (004)
      **na mesma operação** de criação, antes do `insertOne`; valida transições de `status`
      — depende de T005, T006 — faz T003 passar.
- [ ] T009 Criar índices MongoDB: `{sku:1}` único, `{"classificacao.categoria_codigo":1,
      status:1}`, `{"classificacao.departamento":1,"caracteristicas.tamanho_etiqueta":1,
      status:1}` (script de inicialização de índices) — habilita T004/T003 de
      [004-sku/tasks.md](../004-sku/tasks.md).
- [ ] T010 Implementar `backend/src/routes/product.routes.ts`:
      `GET/POST` com `authorize(["admin","operator"])`; `DELETE` (soft-delete) com
      `authorize(["admin"])` — **corrigir divergência identificada no plan.md**: a spec 002
      lista exclusão lógica de produto como permissão exclusiva de `admin`, não de
      `operator` — depende de T008 — faz T004 passar.
- [ ] T011 Registrar `backend/src/modules/product.module.ts` no `server.ts`.

## Fase 4 — Integração cross-spec

- [ ] T012 Integrar `audit-log.service.record("PRODUCT_CREATE" | "PRODUCT_UPDATE" |
      "PRODUCT_DISABLE" | "PRICE_UPDATE", ...)` em `product.service.ts` (`PRICE_UPDATE` deve
      registrar `oldValue`/`newValue`) — depende de T008 e de
      [008-auditoria/tasks.md](../008-auditoria/tasks.md).

## Fase 5 — Frontend

- [ ] T013 [P] `frontend/src/schemas/product.schema.ts` (importa de `shared/schemas`).
- [ ] T014 [P] `frontend/src/services/product.service.ts` (`/api/products/*`).
- [ ] T015 [P] `frontend/src/components/Pagination.tsx`.
- [ ] T016 [P] `frontend/src/components/SearchInput.tsx`.
- [ ] T017 [P] `frontend/src/components/Card.tsx` e `frontend/src/components/ProductCard.tsx`.
- [ ] T018 Implementar `frontend/src/hooks/useProducts.ts` (listagem com filtros) — depende
      de T014.
- [ ] T019 Implementar `frontend/src/hooks/useProduct.ts` (detalhe/edição) — depende de T014.
- [ ] T020 Implementar `frontend/src/features/products/ProductForm.tsx` (RHF + Zod, formulário
      completo — **reutilizado por 006** no fluxo de IA) — depende de T013.
- [ ] T021 Implementar `frontend/src/features/products/ProductFilters.tsx` — depende de T013,
      reutiliza `useCategories` de 003.
- [ ] T022 Implementar `frontend/src/pages/products/ProductsPage.tsx` (tabela +
      busca+filtros+paginação) — depende de `Table.tsx` (002), T015, T016, T018, T021.
- [ ] T023 Implementar `frontend/src/pages/products/ProductFormPage.tsx` (cadastro manual /
      edição) — depende de T019, T020.

## Fase 6 — E2E

- [ ] T024 Teste E2E "cadastrar peça manualmente" — depende de T010–T023.
- [ ] T025 Teste E2E "editar peça" — depende de T010–T023.
- [ ] T026 Teste E2E "marcar peça como vendida" — depende de T010–T023.

## Dependências entre tarefas

```
T001 → T002, T005
T005,T006 → T007,T008 → T010 → T011
T006 → T009
T008 → T012 (requer 008-auditoria)
T013,T014 → T018,T019,T020,T021 → T022,T023 → T024,T025,T026
```
