# Spec 007 — Imagens

**Domínio:** Images
**Fase:** 1/2 — Backoffice / Cadastro inteligente
**Status:** Draft
**Depende de:** [001-autenticacao](../001-autenticacao/spec.md)

## 1. Visão geral

Upload, armazenamento e gerenciamento das fotografias das peças, usadas tanto no cadastro
manual/edição quanto como entrada do cadastro assistido por IA.

## 2. Armazenamento

Provedor preferencial: **Cloudinary**. Alternativas futuras: AWS S3, Cloudflare R2 — acesso
sempre através de uma abstração de provedor de imagens (constituição, princípio VI), para
permitir troca futura sem impacto nas regras de negócio.

O MongoDB (embutido em `products.imagens`) armazena **apenas**: identificador, URL,
metadados, ordem e tipo da imagem. Os arquivos binários nunca são armazenados diretamente
nos documentos de produto.

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

Edição de imagem (crop/filtros) no backoffice, CDN próprio — usar os recursos nativos do
provedor de imagens.

## 9. Conformidade constitucional

Aplica o princípio VI (abstração de integrações externas) e a regra de segurança de upload
do princípio VII da [constituição](../../memory/constitution.md).
