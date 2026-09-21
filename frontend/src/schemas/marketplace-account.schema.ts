import { z } from "zod";
import { MarketplaceEnum } from "../../../shared/dist/schemas/marketplace.schema.js";

export { MarketplaceEnum };
export type Marketplace = z.infer<typeof MarketplaceEnum>;

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  ebay: "eBay",
};

export const ConnectionStatusEnum = z.enum(["connected", "disconnected", "error", "expired"]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusEnum>;

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: "Conectada",
  disconnected: "Desconectada",
  error: "Erro",
  expired: "Expirada",
};

export const MarketplaceAccountSchema = z.object({
  id: z.string(),
  marketplace: MarketplaceEnum,
  label: z.string(),
  credentialPreview: z.string(),
  connectionStatus: ConnectionStatusEnum,
  active: z.boolean(),
  publishedListingsCount: z.number().int().nonnegative(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MarketplaceAccount = z.infer<typeof MarketplaceAccountSchema>;

export interface CredentialFieldConfig {
  /** Chave usada tanto no objeto montado (mercado_livre) quanto no nome do campo do form. */
  key:
    | "credential"
    | "credential_client_id"
    | "credential_client_secret";
  label: string;
  placeholder?: string;
}

/**
 * Campos que compõem a credencial de cada marketplace — o conteúdo varia por conector, nunca
 * é uma única string opaca genérica quando o conector já tem spec própria. Mercado Livre usa
 * OAuth 2.0 (spec 012, seção 2): o admin informa só o aplicativo (Client ID + Client Secret);
 * access/refresh token **nunca são digitados** — vêm do Mercado Livre ao conectar a conta
 * (redirecionamento OAuth), e o ERP os renova com o Client ID/Secret. Shopee/eBay ainda não têm spec própria (011, seção 5,
 * roadmap) — continuam com o campo genérico único até que tenham.
 */
export const MARKETPLACE_CREDENTIAL_FIELDS: Record<Marketplace, CredentialFieldConfig[]> = {
  mercado_livre: [
    { key: "credential_client_id", label: "Client ID", placeholder: "ID do aplicativo (App ID)" },
    { key: "credential_client_secret", label: "Client Secret", placeholder: "Secret Key do aplicativo" },
  ],
  shopee: [{ key: "credential", label: "Credencial", placeholder: "API key, token..." }],
  ebay: [{ key: "credential", label: "Credencial", placeholder: "API key, token..." }],
};

/**
 * Monta o valor único enviado como `credential` à API (backend continua tratando-o como uma
 * string opaca — spec 011, seção 2.1/2.2 — nenhuma mudança de schema no backend). Para
 * marketplaces com um único campo genérico, é o valor literal digitado; para Mercado Livre, é
 * um JSON com o Client ID/Secret — os tokens são acrescentados pelo backend no fluxo OAuth
 * (spec 012, seção 2.1/2.2).
 */
export function buildCredentialPayload(
  marketplace: Marketplace,
  values: Partial<Record<CredentialFieldConfig["key"], string>>,
): string {
  const fields = MARKETPLACE_CREDENTIAL_FIELDS[marketplace];
  if (fields.length === 1 && fields[0]?.key === "credential") {
    return values.credential?.trim() ?? "";
  }

  if (marketplace === "mercado_livre") {
    return JSON.stringify({
      client_id: values.credential_client_id?.trim() ?? "",
      client_secret: values.credential_client_secret?.trim() ?? "",
    });
  }

  return "";
}

const CredentialFieldsShape = {
  credential: z.string().optional(),
  credential_client_id: z.string().optional(),
  credential_client_secret: z.string().optional(),
};

/** Todo campo de credencial da combinação de `marketplace` está preenchido (criação — todos
 * obrigatórios) ou, na edição, ou todos vazios ("não trocar") ou todos preenchidos. */
export function credentialFieldsFilled(
  marketplace: Marketplace,
  values: Partial<Record<CredentialFieldConfig["key"], string>>,
): { filledCount: number; totalCount: number; firstEmptyKey: CredentialFieldConfig["key"] | null } {
  const fields = MARKETPLACE_CREDENTIAL_FIELDS[marketplace];
  let filledCount = 0;
  let firstEmptyKey: CredentialFieldConfig["key"] | null = null;
  for (const field of fields) {
    if (values[field.key]?.trim()) {
      filledCount += 1;
    } else if (firstEmptyKey === null) {
      firstEmptyKey = field.key;
    }
  }
  return { filledCount, totalCount: fields.length, firstEmptyKey };
}

/** Chave de criptografia das credenciais (spec 011, seção 3.1) — só metadados, nunca material de chave. */
export const EncryptionKeyStatusSchema = z.object({
  activeKey: z.object({ id: z.string(), version: z.number(), createdAt: z.coerce.date() }),
  accountsByKeyId: z.record(z.number()),
});
export type EncryptionKeyStatus = z.infer<typeof EncryptionKeyStatusSchema>;

export const KeyRotationReportSchema = z.object({
  previousKeyId: z.string(),
  newKeyId: z.string(),
  total: z.number(),
  rotated: z.number(),
  alreadyCurrent: z.number(),
  skippedConcurrent: z.number(),
  failed: z.array(z.object({ accountId: z.string(), reason: z.string() })),
});
export type KeyRotationReport = z.infer<typeof KeyRotationReportSchema>;

/** Resposta do teste de integração do Mercado Livre (`GET /users/me`) — spec 012, seção 2.4. */
export const IntegrationTestResultSchema = z.object({
  userId: z.union([z.number(), z.string()]),
  nickname: z.string().optional(),
});
export type IntegrationTestResult = z.infer<typeof IntegrationTestResultSchema>;

export const OAuthAuthorizationSchema =z.object({ authorizationUrl: z.string().url(), redirectUri: z.string() });
export type OAuthAuthorization = z.infer<typeof OAuthAuthorizationSchema>;

export const CreateMarketplaceAccountFormSchema = z
  .object({
    marketplace: MarketplaceEnum,
    label: z.string().min(1, "Apelido é obrigatório."),
    ...CredentialFieldsShape,
  })
  .superRefine((data, ctx) => {
    const { filledCount, totalCount, firstEmptyKey } = credentialFieldsFilled(data.marketplace, data);
    if (filledCount < totalCount && firstEmptyKey) {
      const field = MARKETPLACE_CREDENTIAL_FIELDS[data.marketplace].find((f) => f.key === firstEmptyKey)!;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [firstEmptyKey],
        message: `${field.label} é obrigatório.`,
      });
    }
  });
export type CreateMarketplaceAccountFormValues = z.infer<typeof CreateMarketplaceAccountFormSchema>;

/**
 * Todos os campos de credencial em branco significa "não trocar" (spec 011, seção 2.2: trocar
 * sempre substitui o valor inteiro — não existe edição parcial). Como a credencial de Mercado
 * Livre é um par (Client ID + Client Secret), só faz sentido "tudo ou nada": preencher um sem o
 * outro deixaria o par inconsistente.
 */
export const EditMarketplaceAccountFormSchema = z
  .object({
    marketplace: MarketplaceEnum,
    label: z.string().min(1, "Apelido é obrigatório."),
    ...CredentialFieldsShape,
  })
  .superRefine((data, ctx) => {
    const { filledCount, totalCount } = credentialFieldsFilled(data.marketplace, data);
    if (filledCount > 0 && filledCount < totalCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["credential_client_secret"],
        message: "Preencha todos os campos de credencial juntos, ou deixe todos em branco para manter a atual.",
      });
    }
  });
export type EditMarketplaceAccountFormValues = z.infer<typeof EditMarketplaceAccountFormSchema>;
