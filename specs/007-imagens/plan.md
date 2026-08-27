# Plan 007 — Imagens

**Spec:** [spec.md](spec.md)
**Constituição:** [memory/constitution.md](../../memory/constitution.md)
**Depende de:** [001-autenticacao/plan.md](../001-autenticacao/plan.md)

## 1. Stack técnica

> Decisão do projeto (2026-08-22): substitui a sugestão original de Cloudinary (seção 4.4 da
> especificação original) por **Azure Blob Storage** — ver
> [constituição, seção 7](../../memory/constitution.md#7-registro-de-decisões-alterações-desta-constituição).

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + TypeScript + Fastify + `@fastify/multipart` |
| Armazenamento | **Azure Blob Storage** (`@azure/storage-blob`), container privado dedicado (`product-images`) |
| Banco | MongoDB Atlas — apenas metadados (`id`, `url`, `metadados`, `ordem`, `tipo`) embutidos em `products.imagens` |
| Frontend | React + Vite 8 + TypeScript; `<input type="file" accept="image/*" capture="environment">` |

## 2. Contexto técnico

Provedor de imagem é acessado via uma porta (`ImageProviderPort`), nunca diretamente pelos
serviços de produto — mesmo padrão de abstração usado para IA em
[006](../006-produtos-cadastro-ia/plan.md) (constituição, princípio VI).

## 3. Estrutura de arquivos

```
backend/src/
├── plugins/images/image-provider.port.ts   # interface: upload(file) => {id,url,...}; remove(id)
├── plugins/images/azure-blob.adapter.ts     # implementação concreta (@azure/storage-blob, AZURE_STORAGE_*)
├── schemas/image.schema.ts                  # ImageMetadataSchema, UploadConstraintsSchema
├── services/image.service.ts                 # valida MIME/tamanho/quantidade, delega ao adapter
├── routes/image.routes.ts                    # POST /images, DELETE /images/:id
└── modules/image.module.ts

frontend/src/
├── components/ImageUploader.tsx    # já referenciado em 006; captura câmera + preview + ordenação
├── services/image.service.ts        # POST/DELETE /api/images
└── hooks/useImageUpload.ts          # TanStack Query mutation com progresso/erro
```

## 4. Fluxo de execução (camadas)

```
ImageUploader (input capture="environment")
  → image.service.ts (POST /api/images, multipart)
  → routes/image.routes.ts (authenticate obrigatório)
  → services/image.service.ts
      → valida MIME type, extensão, tamanho, nº máx. de imagens (config)
      → plugins/images/azure-blob.adapter.ts (upload do binário para o container)
  → retorna { id, url, ordem, tipo } → MongoDB guarda somente este metadado em products.imagens
```

## 5. Passos de implementação

1. `plugins/images/image-provider.port.ts`: `upload(buffer, mimeType): Promise<ImageAsset>`,
   `remove(id: string): Promise<void>`.
2. `plugins/images/azure-blob.adapter.ts`: implementação usando `@azure/storage-blob`
   (`BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING)`), gravando no
   container `AZURE_STORAGE_CONTAINER_NAME`; nome do blob `{uuid}.{ext}`; `remove(id)` chama
   `containerClient.getBlockBlobClient(id).deleteIfExists()`. Se leitura pública direta não
   for habilitada no container, gerar URL de leitura via **SAS token** com expiração
   configurável (ex.: `AZURE_STORAGE_SAS_EXPIRY_MINUTES`) no momento da resposta do upload.
3. `services/image.service.ts`: validações obrigatórias antes de qualquer chamada ao
   provedor — MIME type permitido, tamanho máximo por arquivo, extensões permitidas, número
   máximo de imagens por peça (constantes configuráveis).
4. `routes/image.routes.ts`: `POST /images` e `DELETE /images/:id`, ambos exigindo apenas
   `authenticate` (qualquer perfil logado pode fazer upload conforme permissões de operador/
   admin definidas em 002; `viewer` não deve chamar esta rota via UI, mas o backend também
   deve aplicar `authorize(["admin","operator"])` para reforçar a regra).
5. Frontend: `ImageUploader` com checklist visual (Frente/Costas/Etiqueta/Detalhes/Defeitos,
   ver seção 6 da spec), preview e reordenação antes do envio; integra tanto com cadastro
   manual (005) quanto com o fluxo de IA (006).

## 6. Testes planejados

- Unitário: `image.service` rejeita MIME type inválido, arquivo acima do tamanho máximo, e
  upload além do limite de imagens por peça.
- Integração: `POST /images` sem autenticação retorna `401`; upload válido retorna metadado
  completo (sem binário) pronto para ser referenciado em `products.imagens`.

## 7. Riscos / decisões em aberto

- Limites exatos (tamanho máximo em MB, nº máximo de imagens por peça) ficam como constantes
  de configuração a definir na implementação — a spec não fixa um número exato.
- **Estratégia de URL**: se o container permanecer privado, a `url` persistida em
  `products.imagens` não pode depender de um SAS token de curta duração (o link expiraria e
  quebraria a imagem exibida no catálogo). Duas opções a decidir na implementação: (a)
  container com acesso de leitura público a nível de blob (mais simples, adequado ao MVP,
  pois as fotos não são dados sensíveis) ou (b) endpoint de leitura autenticado no backend
  que gera SAS sob demanda a cada exibição. Recomenda-se (a) para o MVP, revisitando (b) se
  houver exigência de acesso restrito.
