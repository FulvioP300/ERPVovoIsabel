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
| Frontend | React + Vite 8 + TypeScript; `<input type="file" accept="image/*" multiple>` — **sem** `capture` (spec, seção 5: com `capture="environment"` o navegador força a câmera direto, sem opção de galeria — bug corrigido nesta revisão) |

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
ImageUploader (input sem capture — seletor nativo oferece câmera OU galeria)
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
   ver seção 7 da spec), preview e reordenação antes do envio; integra tanto com cadastro
   manual (005) quanto com o fluxo de IA (006).
6. Frontend: `ImageLightbox` — overlay de visualização ampliada ao clicar numa miniatura já
   enviada (spec, seção 6). Ver seção 5.1 abaixo para o desenho técnico.

### 5.1 `ImageLightbox` (visualização ampliada)

Componente novo, reutilizável: `frontend/src/components/ImageLightbox.tsx`.

```
interface ImageLightboxProps {
  url: string;
  onClose: () => void;
}
```

- Renderiza um overlay `position: fixed`, cobrindo a viewport inteira (`inset-0`), com fundo
  escurecido semi-transparente (`bg-black/80` ou equivalente) e `z-index` acima de qualquer
  outro elemento da tela de cadastro/edição.
- A imagem ampliada usa `object-fit: contain` com `max-width`/`max-height` abaixo de 100% da
  viewport (ex. 90vw/90vh) — garante uma margem de fundo clicável em qualquer proporção de
  tela/imagem (spec, seção 6).
- Fecha (`onClose`) em três gatilhos: clique no elemento de fundo (não na imagem — usar
  `stopPropagation()` no `<img>` pra não propagar o clique pro fundo), tecla `Esc` (listener
  `keydown` registrado só enquanto o overlay está montado, removido no cleanup do `useEffect`),
  e um botão `×` fixo num canto do overlay.
- **Sem portal do React** (`createPortal`) — `position: fixed` já é suficiente neste caso,
  já que não há nenhum ancestral com `overflow: hidden`/`transform` entre `ImageUploader` e o
  `<body>` que quebraria o posicionamento fixo (confirmar na implementação; se algum ancestral
  futuro introduzir isso, migrar pra portal é a correção).
- Bloqueio de scroll do fundo enquanto aberto: `document.body.style.overflow = "hidden"` no
  mount, restaurado no unmount (mesmo padrão comum de modal).

`ImageUploader.tsx`: cada miniatura ganha um `onClick` que abre o lightbox com a `url` daquela
imagem (estado local `previewUrl: string | null`); o botão de remover (`×` já existente sobre
a miniatura) precisa de `onClick` com `stopPropagation()` pra não também disparar a abertura
do lightbox.

### 5.2 Correção: escolher da galeria além de tirar foto (bug real, spec seção 5)

Remover o atributo `capture="environment"` do `<input type="file" accept="image/*">` — é
literalmente a única mudança de código necessária, em **dois lugares** que hoje têm o mesmo
input duplicado (nenhum dos dois reaproveita `ImageUploader` — histórico, não desenhado
assim de propósito):

- `frontend/src/components/ImageUploader.tsx` (cadastro/edição manual — 005/007).
- `frontend/src/features/products-ai/AiIntakeForm.tsx` (cadastro por IA — 006, input próprio,
  não usa `ImageUploader`).

Nenhuma mudança de contrato, schema ou backend — é puramente um atributo HTML do input já
existente em ambos os componentes.

## 6. Testes planejados

- Unitário: `image.service` rejeita MIME type inválido, arquivo acima do tamanho máximo, e
  upload além do limite de imagens por peça.
- Integração: `POST /images` sem autenticação retorna `401`; upload válido retorna metadado
  completo (sem binário) pronto para ser referenciado em `products.imagens`.
- `ImageLightbox` (componente novo, sem chamada de API): clique numa miniatura abre o overlay
  com a `url` correta; clique no fundo, `Esc`, e clique no `×` do overlay todos chamam
  `onClose`; clique na própria imagem ampliada não chama `onClose`; clique no botão de remover
  foto não abre o overlay (evento não propaga).
- Remoção do `capture`: não é testável de forma automatizada de forma confiável (o
  comportamento do seletor nativo é do navegador/SO, fora do controle do app) — validação é
  manual, num celular real (iOS e Android), confirmando que aparecem as duas opções.

## 7. Riscos / decisões em aberto

- ~~Limites exatos~~ — resolvido na implementação (integrada a 005): `MAX_IMAGE_SIZE_BYTES` =
  5MB por arquivo (`backend/src/schemas/image.schema.ts`); MIME types permitidos: JPEG, PNG,
  WebP. `MAX_PRODUCT_IMAGES` = 10 fotos por peça — mas essa contagem **não** é validada em
  `POST /api/images` (a rota não é escopada por produto); é aplicada no
  `ProductSchema.imagens.galeria.max()` (`shared/schemas/product.schema.ts`), fonte única
  tanto para o schema quanto para o limite exibido no `ImageUploader` do frontend.
- ~~Estratégia de URL~~ — resolvido pelo
  [ADR-003](../../memory/decisions.md#adr-003--topologia-do-azure-blob-storage-1-storage-account-leitura-pública-a-nível-de-blob):
  container com **leitura pública a nível de blob** (opção (a) descrita originalmente aqui),
  em uma única Storage Account (`stvovoisabel`) com containers `product-images-{dev,test,prod}`
  por ambiente. Validado de ponta a ponta (upload → leitura anônima → remoção).
- Checklist visual (Frente/Costas/Etiqueta/Detalhes/Defeitos, seção 7 da spec) e reordenação
  manual de fotos **não foram implementados** — o pedido que motivou esta spec (integrada a
  005) foi só "N fotos, upload e remoção no cadastro/edição"; a primeira foto da galeria vira
  a capa automaticamente, sem seletor dedicado. Reavaliar quando 006 (cadastro por IA)
  precisar do checklist de fato.
- `ImageLightbox` (seção 5.1, seção 6 da spec) ainda **não implementado** — só desenhado
  nesta revisão, a pedido explícito do usuário ("apenas na spec, não desenvolver ainda").
- Remoção do `capture="environment"` (seção 5.2, seção 5 da spec) também ainda **não
  implementada** — mesma restrição do usuário nesta revisão. Risco de comportamento
  divergente entre navegadores mobile: a maioria dos Android Chrome/iOS Safari atuais mostra
  as duas opções sem `capture`, mas WebViews embutidos ou navegadores mais antigos podem se
  comportar diferente — se isso for confirmado na implementação, a alternativa é expor dois
  botões explícitos ("Tirar foto" com `capture`, "Escolher da galeria" sem `capture`) em vez
  de depender do seletor nativo único.
