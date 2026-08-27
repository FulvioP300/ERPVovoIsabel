---
name: decisions
description: Registro de decisões arquiteturais (ADR) do ERP da Vovó Isabel — histórico de escolhas técnicas que desviam ou detalham o documento fonte original.
---

# Registro de Decisões Arquiteturais — ERP da Vovó Isabel

Este documento mantém o histórico de decisões técnicas relevantes tomadas ao longo do
projeto, no formato ADR (*Architecture Decision Record*). Fica separado de
[constitution.md](constitution.md) para que a constituição continue enxuta e focada em
princípios estáveis, enquanto este arquivo cresce com o tempo.

Toda decisão aqui registrada que altere a stack tecnológica da seção 2 da constituição deve
também atualizar a tabela correspondente em `constitution.md`. Decisões que desviam do
documento fonte original (`Especificação Funcional e Técnica — Brechó da Vovó Isabel.md`)
devem apontar para a versão do documento fonte que reflete a mudança, quando existir (ver
`Especificação Funcional e Técnica — Brechó da Vovó Isabel (v1.1).md`).

## Convenção

Cada ADR segue o formato:

```
## ADR-NNN — Título

**Status:** Proposta | Aceita | Superada por ADR-XXX
**Data:** AAAA-MM-DD
**Specs afetadas:** lista de specs em specs/

### Contexto
### Decisão
### Consequências
```

---

## ADR-001 — Provedor de armazenamento de imagens: Azure Blob Storage

**Status:** Aceita
**Data:** 2026-08-22
**Specs afetadas:** [007-imagens](../specs/007-imagens/spec.md)

### Contexto

O documento fonte original (v1.0, seção 4.4) sugeria **Cloudinary** como provedor
preferencial de armazenamento de imagens, com AWS S3 e Cloudflare R2 como alternativas
futuras. O time do projeto decidiu adotar diretamente **Azure Blob Storage** como provedor
de imagens desde o MVP.

### Decisão

Substituir Cloudinary por Azure Blob Storage em todas as referências de stack e
implementação:

- `memory/constitution.md`, seção 2 (tabela de stack).
- [specs/007-imagens/spec.md](../specs/007-imagens/spec.md): seção de armazenamento
  reescrita (container privado, acesso via URL pública de blob ou SAS token, upload/remoção
  exclusivos do backend).
- [specs/007-imagens/plan.md](../specs/007-imagens/plan.md): adapter
  `backend/src/plugins/images/azure-blob.adapter.ts` usando `@azure/storage-blob`.
- [specs/007-imagens/tasks.md](../specs/007-imagens/tasks.md): tarefa de implementação do
  adapter e de configuração de dependência/variáveis de ambiente.
- `backend/.env.example`: `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` /
  `CLOUDINARY_API_SECRET` → `AZURE_STORAGE_CONNECTION_STRING` / `AZURE_STORAGE_CONTAINER_NAME`.
- `backend/package.json`: dependência `@azure/storage-blob`.
- Nova versão do documento fonte:
  `Especificação Funcional e Técnica — Brechó da Vovó Isabel (v1.1).md` (documento original
  v1.0 preservado sem alterações, como referência histórica).

### Consequências

- **Sem impacto em regras de negócio.** A troca foi viabilizada inteiramente pela abstração
  de provedor de imagens exigida pela constituição, princípio VI (`ImageProviderPort`): só o
  adapter concreto muda. O contrato (`upload`/`remove`) e o modelo de dados persistido em
  `products.imagens` (id, URL, metadados, ordem, tipo) permanecem idênticos.
- **Decisão em aberto** (ver [plan.md](../specs/007-imagens/plan.md), seção 7): definir se o
  container do Azure Blob Storage terá leitura pública a nível de blob (mais simples,
  recomendado para o MVP, já que fotos de produto não são dado sensível) ou se o backend
  gerará SAS tokens sob demanda para cada exibição (mais restritivo, maior complexidade).
- Nenhuma outra spec ou domínio (categorias, SKU, produtos, IA) precisou de alteração.

---

<!--
Ao registrar uma nova ADR, copiar o bloco de convenção acima, numerar sequencialmente
(ADR-002, ADR-003, ...) e atualizar constitution.md se a decisão alterar a stack fixada na
seção 2.
-->
