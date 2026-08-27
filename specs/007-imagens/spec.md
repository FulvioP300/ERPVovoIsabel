# Spec 007 — Imagens

**Domínio:** Images
**Fase:** 1/2 — Backoffice / Cadastro inteligente
**Status:** Draft
**Depende de:** [001-autenticacao](../001-autenticacao/spec.md)

## 1. Visão geral

Upload, armazenamento e gerenciamento das fotografias das peças, usadas tanto no cadastro
manual/edição quanto como entrada do cadastro assistido por IA.

## 2. Armazenamento

Provedor: **Azure Blob Storage** (Blob Container dedicado, ex. `product-images`). Acesso
sempre através de uma abstração de provedor de imagens (constituição, princípio VI), para
permitir troca futura de provedor sem impacto nas regras de negócio.

Cada imagem é enviada como um blob (nome sugerido: `{productId ou uploadId}/{uuid}.{ext}`)
no container configurado. A URL pública/assinada retornada pelo Azure é o valor persistido
em `products.imagens.*.url`.

O MongoDB (embutido em `products.imagens`) armazena **apenas**: identificador, URL,
metadados, ordem e tipo da imagem. Os arquivos binários nunca são armazenados diretamente
nos documentos de produto.

### Acesso e segurança do blob

- Container configurado como privado; leitura das imagens é feita via URL com **SAS token**
  de leitura (com expiração) gerada pelo backend, ou via CDN/Front Door na frente do storage
  account, quando publicação de e-commerce exigir URLs públicas de longa duração
  (fase futura — fora do MVP).
- Escrita (upload) e exclusão de blobs ocorrem **exclusivamente** pelo backend, autenticado
  com a connection string / credencial do storage account — nunca exposta ao frontend.

## 3. API

```
POST   /api/images
DELETE /api/images/:id
```

Upload permitido somente para usuários autenticados.

## 4. Validações obrigatórias no upload

- MIME type permitido (apenas imagens).
- Tamanho máximo por arquivo.
- Número máximo de imagens por peça.
- Extensões permitidas.

Falha em qualquer validação rejeita o upload antes de qualquer chamada ao provedor de
armazenamento.

## 5. Captura no celular

O input de arquivo deve aceitar captura direta pela câmera quando suportado pelo navegador:

```html
<input type="file" accept="image/*" capture="environment" />
```

Fluxo desejado no cadastro por peça:

```
Abrir cadastro → Fotografar frente → Fotografar costas → Fotografar etiqueta
   → Informar descrição → Analisar com IA
```

## 6. Imagens recomendadas por peça

1. Frente, 2. Costas, 3. Etiqueta, 4. Detalhes, 5. Defeitos (se existentes). O sistema deve
orientar o usuário nesta ordem/checklist tanto no cadastro manual quanto no cadastro por IA.

## 7. Critérios de aceite

- Upload de imagem fora do MIME type permitido é rejeitado com erro claro.
- Upload acima do tamanho máximo configurado é rejeitado.
- Excedido o número máximo de imagens por peça, novos uploads são bloqueados até remoção de
  alguma existente.
- Usuário não autenticado recebe `401`/`403` ao tentar `POST /api/images`.

## 8. Fora de escopo

Edição de imagem (crop/filtros) no backoffice, CDN/Front Door próprio na frente do Blob
Storage — usar os recursos nativos do provedor enquanto não houver necessidade concreta de
URLs públicas de longa duração (ex. e-commerce público, fase 3 do roadmap).

## 9. Conformidade constitucional

Aplica o princípio VI (abstração de integrações externas) e a regra de segurança de upload
do princípio VII da [constituição](../../memory/constitution.md). A escolha de Azure Blob
Storage substitui a sugestão original de Cloudinary do documento fonte (seção 4.4) — registro
da decisão em [constituição, seção 7](../../memory/constitution.md#7-registro-de-decisões-alterações-desta-constituição).
