# Plan 009 — Dashboard Administrativo

**Spec:** [spec.md](spec.md)
**Constituição:** [memory/constitution.md](../../memory/constitution.md)
**Depende de:** [005-produtos-cadastro-manual/plan.md](../005-produtos-cadastro-manual/plan.md)

## 1. Stack técnica

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + TypeScript + Fastify + MongoDB Driver oficial (aggregation pipeline) |
| Frontend | React + Vite 8 + TypeScript + React Router + TanStack Query |

## 2. Contexto técnico

Tela inicial pós-login; agrega dados de `products` via `aggregate()`/`countDocuments()`. Sem
cache nesta fase (constituição, princípio V — simplicidade até haver necessidade real de
performance).

## 3. Estrutura de arquivos

```
backend/src/
├── services/dashboard.service.ts    # getSummary(): agrega os 6 indicadores do MVP
├── routes/dashboard.routes.ts       # GET /api/dashboard/summary
└── modules/dashboard.module.ts

frontend/src/
├── services/dashboard.service.ts
├── hooks/useDashboardSummary.ts     # TanStack Query
├── pages/DashboardPage.tsx
├── layouts/BackofficeLayout.tsx     # sidebar (Dashboard/Produtos/Categorias/Usuários/Config.)
├── components/Sidebar.tsx
├── components/Header.tsx
└── components/Loading.tsx
```

## 4. Indicadores e origem dos dados

```
Produtos disponíveis        → countDocuments({ status: "disponivel" })
Produtos cadastrados hoje   → countDocuments({ "identificacao.data_cadastro": { $gte: inícioDoDia } })
Produtos vendidos           → countDocuments({ status: "vendido" })
Produtos em revisão         → countDocuments({ status: "em_revisao" })
Produtos sem preço          → countDocuments({ "preco.preco_venda": null })
Produtos sem imagens        → countDocuments({ "imagens.principal": null, "imagens.galeria": { $size: 0 } })
```

## 5. Passos de implementação

1. `services/dashboard.service.ts`: `getSummary()` executa os seis `countDocuments`/
   `aggregate` acima em paralelo (`Promise.all`).
2. `routes/dashboard.routes.ts`: `GET /api/dashboard/summary`, `authenticate` obrigatório
   (qualquer perfil logado); nenhuma restrição adicional de `role` — os números agregados não
   expõem dado individual sensível.
3. `layouts/BackofficeLayout.tsx`: sidebar cujos itens são filtrados pela role do usuário
   logado (ex.: "Usuários" só para `admin`), consumindo o mesmo helper de permissões definido
   em 002.
4. `pages/DashboardPage.tsx`: renderiza os 6 indicadores como `Card`s (componente de 005),
   com estado de `loading`/`error` padrão.

## 6. Testes planejados

- Unitário: `dashboard.service.getSummary` com fixtures de produtos cobrindo cada indicador.
- Integração: `GET /api/dashboard/summary` retorna os 6 campos esperados.
- E2E: login redireciona ao dashboard e os indicadores carregam sem erro.

## 7. Riscos / decisões em aberto

- Indicadores futuros (faturamento, ticket médio, giro de estoque etc.) dependem de domínios
  de venda ainda não especificados — não implementar agora, apenas deixar `DashboardPage`
  estruturada para novos `Card`s.
