# ERP da Vovó Isabel

E-commerce + Backoffice administrativo + cadastro de produtos assistido por IA para o Brechó
da Vovó Isabel.

Este projeto segue a metodologia **spec-driven development**: nenhuma funcionalidade é
implementada sem uma spec correspondente em [`specs/`](specs/), e todas as specs devem estar
em conformidade com os princípios definidos em
[`memory/constitution.md`](memory/constitution.md).

## Estrutura

```
ERP/
├── memory/
│   └── constitution.md          # princípios inegociáveis do projeto
├── specs/                       # uma pasta por domínio funcional
│   ├── 001-autenticacao/
│   ├── 002-usuarios/
│   ├── 003-categorias/
│   ├── 004-sku/
│   ├── 005-produtos-cadastro-manual/
│   ├── 006-produtos-cadastro-ia/
│   ├── 007-imagens/
│   ├── 008-auditoria/
│   └── 009-dashboard/
├── backend/                     # API Fastify + TypeScript + MongoDB
│   └── src/
├── frontend/                    # React + Vite 8 + TypeScript
│   └── src/
├── shared/                      # schemas/types Zod compartilhados entre front e back
└── Especificação Funcional e Técnica — Brechó da Vovó Isabel.md   # documento fonte original
```

## Ordem de leitura recomendada

1. [`memory/constitution.md`](memory/constitution.md) — princípios e restrições do projeto.
2. `specs/001-autenticacao` → `009-dashboard` — specs do MVP (fase 1 e 2 do roadmap), na
   ordem de dependência indicada em cada spec.
3. Documento fonte (`Especificação Funcional e Técnica...md`) — referência histórica completa;
   em caso de conflito, a constituição e as specs prevalecem.

## Como rodar (após `npm install` em cada pacote)

```bash
# Backend
cd backend
cp .env.example .env   # preencher MONGODB_URI, JWT secrets, AI_API_KEY, Cloudinary
npm install
npm run dev             # http://localhost:3333

# Frontend
cd frontend
npm install
npm run dev              # http://localhost:5173
```

## Escopo do MVP

Login, Dashboard, Usuários, Categorias, Produtos (cadastro manual e por IA), SKU automático,
upload de imagens, edição de produto, busca, controle de status e auditoria básica. Detalhes
completos em [`memory/constitution.md`](memory/constitution.md#4-escopo-do-mvp).
