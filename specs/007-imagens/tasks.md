# Tasks 007 — Imagens

**Spec:** [spec.md](spec.md) | **Plan:** [plan.md](plan.md)
**Depende de:** [001-autenticacao/tasks.md](../001-autenticacao/tasks.md),
[002-usuarios/tasks.md](../002-usuarios/tasks.md) (`authorize.middleware.ts`)
**Convenção:** `[P]` = tarefa paralelizável.

## Fase 1 — Contrato e testes

- [ ] T001 [P] Definir `backend/src/plugins/images/image-provider.port.ts`
      (`upload(buffer, mimeType): Promise<ImageAsset>`, `remove(id): Promise<void>`).
- [ ] T002 [P] Implementar `backend/src/schemas/image.schema.ts`
      (`ImageMetadataSchema`, `UploadConstraintsSchema` — MIME types permitidos, tamanho
      máximo, quantidade máxima).
- [ ] T003 Teste unitário `backend/src/services/image.service.test.ts`: rejeita MIME type
      inválido; rejeita arquivo acima do tamanho máximo; rejeita upload além do limite de
      imagens por peça — **antes** de qualquer chamada ao provedor externo.
- [ ] T004 Teste de integração `backend/tests/integration/images.spec.ts` (adapter Cloudinary
      mockado): `POST /api/images` sem autenticação retorna 401; upload válido retorna
      metadado completo (`id`, `url`, `ordem`, `tipo`) sem o binário.

## Fase 2 — Implementação core (backend)

- [ ] T005 Implementar `backend/src/plugins/images/cloudinary.adapter.ts`
      (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) — depende de
      T001.
- [ ] T006 Implementar `backend/src/services/image.service.ts` (valida MIME/extensão/
      tamanho/quantidade via T002, delega upload/remoção ao adapter T005) — depende de T002,
      T005 — faz T003 passar.
- [ ] T007 Implementar `backend/src/routes/image.routes.ts`
      (`POST /images`, `DELETE /images/:id`, `authenticate` +
      `authorize(["admin","operator"])`) — depende de T006 — faz T004 passar.
- [ ] T008 Registrar `backend/src/modules/image.module.ts` no `server.ts`.

## Fase 3 — Frontend

- [ ] T009 [P] `frontend/src/services/image.service.ts` (`POST`/`DELETE /api/images`).
- [ ] T010 Implementar `frontend/src/hooks/useImageUpload.ts` (TanStack Query mutation com
      progresso/erro) — depende de T009.
- [ ] T011 Implementar `frontend/src/components/ImageUploader.tsx`
      (`<input type="file" accept="image/*" capture="environment">`, checklist visual
      Frente/Costas/Etiqueta/Detalhes/Defeitos, preview e reordenação) — depende de T010.
      **Componente reutilizado por [005](../005-produtos-cadastro-manual/tasks.md) e
      [006](../006-produtos-cadastro-ia/tasks.md).**

## Dependências entre tarefas

```
T001,T002 → T005,T006 → T007 → T008
T009 → T010 → T011
```

## Nota

Definir nesta fase, como constantes de configuração (não fixadas pela spec): tamanho máximo
por arquivo (MB) e número máximo de imagens por peça.
