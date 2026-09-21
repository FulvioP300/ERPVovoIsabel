import { getDb } from "../database/mongo.client.js";
import {
  marketplaceAccountRepository,
  type MarketplaceAccountRecord,
} from "../repositories/marketplace-account.repository.js";
import type { Marketplace, MarketplaceAccount as MarketplaceAccountOutput } from "../schemas/marketplace-account.schema.js";
import { encryptCredential, decryptCredential, maskCredential } from "./credential-encryption.service.js";
import { parseMercadoLivreCredential } from "../schemas/mercado-livre-credential.schema.js";
import { productRepository } from "../repositories/product.repository.js";
import { record } from "./audit-log.service.js";

export class MarketplaceAccountNotFoundError extends Error {
  constructor() {
    super("Conta de marketplace não encontrada.");
    this.name = "MarketplaceAccountNotFoundError";
  }
}

/**
 * Passo do ciclo Desconectar → Desativar → Apagar feito fora de ordem (spec 011, seção 2.2.2).
 * A mensagem diz qual passo falta.
 */
export class MarketplaceAccountLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceAccountLifecycleError";
  }
}

/** Credencial fora do formato exigido pelo marketplace (ex.: Mercado Livre sem Client ID/Secret). */
export class InvalidCredentialFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCredentialFormatError";
  }
}

/** Mercado Livre: JSON com `client_id` e `client_secret` (spec 012, seção 2.1) — os tokens vêm
 * do fluxo OAuth, nunca são digitados. Demais marketplaces: texto opaco (ainda sem spec própria). */
function assertValidCredential(marketplace: Marketplace, credential: string): void {
  if (marketplace === "mercado_livre" && !parseMercadoLivreCredential(credential)) {
    throw new InvalidCredentialFormatError("Informe o Client ID e o Client Secret do aplicativo do Mercado Livre.");
  }
}

/** Trecho mascarado para o admin reconhecer a conta. No Mercado Livre vem do `client_id` (não é
 * segredo e identifica o aplicativo) — o fim do JSON seria igual para todas as contas. */
function previewFor(marketplace: Marketplace, credential: string): string {
  const parsed = marketplace === "mercado_livre" ? parseMercadoLivreCredential(credential) : null;
  return maskCredential(parsed?.client_id ?? credential);
}

/** Nunca inclui `credential` em texto completo (spec 011, seção 2.2). */
export function toMarketplaceAccountOutput(
  account: MarketplaceAccountRecord,
  publishedListingsCount = 0,
): MarketplaceAccountOutput {
  return {
    id: account.id,
    marketplace: account.marketplace,
    label: account.label,
    credentialPreview: account.credentialPreview,
    connectionStatus: account.connectionStatus,
    active: account.active,
    publishedListingsCount,
    createdBy: account.createdBy,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/**
 * Monta a resposta de contas já com `publishedListingsCount` (spec 011, seção 2.2.2): um único
 * `aggregate` em `products` para todas as contas da chamada. Toda resposta de conta passa por aqui.
 */
export async function presentMarketplaceAccounts(
  accounts: MarketplaceAccountRecord[],
): Promise<MarketplaceAccountOutput[]> {
  const counts = await productRepository.countPublishedListingsByAccount(getDb());
  return accounts.map((account) => toMarketplaceAccountOutput(account, counts.get(account.id) ?? 0));
}

export async function presentMarketplaceAccount(account: MarketplaceAccountRecord): Promise<MarketplaceAccountOutput> {
  return (await presentMarketplaceAccounts([account]))[0]!;
}

export interface CreateMarketplaceAccountServiceInput {
  marketplace: Marketplace;
  label: string;
  credential: string;
  actingAdminId: string;
}

export async function createMarketplaceAccount(
  input: CreateMarketplaceAccountServiceInput,
): Promise<MarketplaceAccountOutput> {
  assertValidCredential(input.marketplace, input.credential);
  const db = getDb();

  const account = await marketplaceAccountRepository.create(db, {
    marketplace: input.marketplace,
    label: input.label,
    credential: await encryptCredential(input.credential),
    credentialPreview: previewFor(input.marketplace, input.credential),
    createdBy: input.actingAdminId,
  });

  await record("MARKETPLACE_ACCOUNT_CREATE", "marketplace_account", account.id, input.actingAdminId, {
    marketplace: account.marketplace,
    label: account.label,
  });

  return presentMarketplaceAccount(account);
}

export interface ListMarketplaceAccountsInput {
  marketplace?: Marketplace;
  active?: boolean;
}

export async function listMarketplaceAccounts(
  input: ListMarketplaceAccountsInput,
  actingAdminId: string,
): Promise<MarketplaceAccountOutput[]> {
  const db = getDb();
  const accounts = await marketplaceAccountRepository.list(db, input);

  // Auditoria de visualização (spec 011, seção 2.2/3) — um único registro por chamada, não um
  // por conta listada, para não inflar audit_logs numa listagem com muitas contas.
  await record("MARKETPLACE_ACCOUNT_VIEW", "marketplace_account", undefined, actingAdminId, {
    count: accounts.length,
  });

  return presentMarketplaceAccounts(accounts);
}

export async function getMarketplaceAccountById(
  id: string,
  actingAdminId: string,
): Promise<MarketplaceAccountOutput> {
  const db = getDb();
  const account = await marketplaceAccountRepository.findById(db, id);
  if (!account) throw new MarketplaceAccountNotFoundError();

  await record("MARKETPLACE_ACCOUNT_VIEW", "marketplace_account", id, actingAdminId);

  return presentMarketplaceAccount(account);
}

export interface UpdateMarketplaceAccountServiceInput {
  label?: string;
  credential?: string;
}

export async function updateMarketplaceAccountProfile(
  id: string,
  input: UpdateMarketplaceAccountServiceInput,
  actingAdminId: string,
): Promise<MarketplaceAccountOutput> {
  const db = getDb();
  const before = await marketplaceAccountRepository.findById(db, id);
  if (!before) throw new MarketplaceAccountNotFoundError();
  if (input.credential !== undefined) assertValidCredential(before.marketplace, input.credential);

  await marketplaceAccountRepository.updateProfile(db, id, {
    label: input.label,
    credential: input.credential !== undefined ? await encryptCredential(input.credential) : undefined,
    credentialPreview: input.credential !== undefined ? previewFor(before.marketplace, input.credential) : undefined,
  });

  // Client ID/Secret novos invalidam os tokens antigos (pertenciam ao aplicativo anterior): a
  // conta precisa ser reconectada pelo fluxo OAuth (spec 012, seção 2.2).
  if (input.credential !== undefined && before.marketplace === "mercado_livre") {
    await marketplaceAccountRepository.updateConnectionStatus(db, id, "disconnected");
  }

  const after = await marketplaceAccountRepository.findById(db, id);
  if (!after) throw new MarketplaceAccountNotFoundError();

  // Nunca registra valor antigo/novo da credencial em metadata (spec 011, seção 3) — só o
  // fato de que ela mudou.
  await record("MARKETPLACE_ACCOUNT_UPDATE", "marketplace_account", id, actingAdminId, {
    ...(input.label !== undefined ? { label: { oldValue: before.label, newValue: after.label } } : {}),
    ...(input.credential !== undefined ? { credentialChanged: true } : {}),
  });

  return presentMarketplaceAccount(after);
}

export async function updateMarketplaceAccountStatus(
  id: string,
  active: boolean,
  actingAdminId: string,
): Promise<MarketplaceAccountOutput> {
  const db = getDb();
  const before = await marketplaceAccountRepository.findById(db, id);
  if (!before) throw new MarketplaceAccountNotFoundError();
  if (!active && before.connectionStatus !== "disconnected") {
    throw new MarketplaceAccountLifecycleError("Desconecte a conta antes de desativá-la.");
  }

  await marketplaceAccountRepository.updateStatus(db, id, active);

  // Mesmo padrão de category.service.ts (003): desativar usa o evento nomeado explicitamente
  // (MARKETPLACE_ACCOUNT_DISABLE); qualquer outra transição (incluindo reativar) usa o evento
  // genérico de atualização.
  const action = active ? "MARKETPLACE_ACCOUNT_UPDATE" : "MARKETPLACE_ACCOUNT_DISABLE";
  await record(action, "marketplace_account", id, actingAdminId, { oldValue: before.active, newValue: active });

  const after = await marketplaceAccountRepository.findById(db, id);
  if (!after) throw new MarketplaceAccountNotFoundError();
  return presentMarketplaceAccount(after);
}

/**
 * Primeiro passo do ciclo de remoção (spec 011, seção 2.2.2). Vale de qualquer estado. No Mercado
 * Livre descarta os tokens e mantém só Client ID/Secret — a conta pode ser reconectada pelo OAuth.
 * É local ao ERP: não revoga a autorização no Mercado Livre.
 */
export async function disconnectMarketplaceAccount(
  id: string,
  actingAdminId: string,
): Promise<MarketplaceAccountOutput> {
  const db = getDb();
  const before = await marketplaceAccountRepository.findById(db, id);
  if (!before) throw new MarketplaceAccountNotFoundError();

  let credentialWithoutTokens: string | undefined;
  if (before.marketplace === "mercado_livre") {
    const parsed = parseMercadoLivreCredential(await decryptCredential(before.credential));
    if (parsed) {
      credentialWithoutTokens = await encryptCredential(
        JSON.stringify({ client_id: parsed.client_id, client_secret: parsed.client_secret }),
      );
    }
  }
  await marketplaceAccountRepository.markDisconnected(db, id, credentialWithoutTokens);

  await record("MARKETPLACE_ACCOUNT_DISCONNECT", "marketplace_account", id, actingAdminId, {
    previousConnectionStatus: before.connectionStatus,
  });

  const after = await marketplaceAccountRepository.findById(db, id);
  if (!after) throw new MarketplaceAccountNotFoundError();
  return presentMarketplaceAccount(after);
}

/**
 * Último passo do ciclo (spec 011, seção 2.2.2; ADR-022): remoção física, só de conta já
 * desconectada **e** desativada. Publicações existentes não são afetadas — guardam
 * `conta_id`/`conta_apelido`.
 */
export async function deleteMarketplaceAccount(id: string, actingAdminId: string): Promise<void> {
  const db = getDb();
  const account = await marketplaceAccountRepository.findById(db, id);
  if (!account) throw new MarketplaceAccountNotFoundError();

  if (account.connectionStatus !== "disconnected") {
    throw new MarketplaceAccountLifecycleError("Desconecte e desative a conta antes de apagá-la.");
  }
  if (account.active) {
    throw new MarketplaceAccountLifecycleError("Desative a conta antes de apagá-la.");
  }

  if (!(await marketplaceAccountRepository.delete(db, id))) throw new MarketplaceAccountNotFoundError();

  // Só o que identifica a conta — nunca a credencial (spec 011, seção 3).
  await record("MARKETPLACE_ACCOUNT_DELETE", "marketplace_account", id, actingAdminId, {
    marketplace: account.marketplace,
    label: account.label,
  });
}

/**
 * Uso interno por `marketplace-listing.service.ts` (publicação) — **nunca** exposta via rota
 * HTTP. Retorna a credencial decriptada em memória (spec 011, seção 3); não gera
 * `MARKETPLACE_ACCOUNT_VIEW` (esse evento cobre visualização/gestão da conta em si, não seu
 * uso interno para autenticar um conector — a publicação já gera seu próprio registro de
 * auditoria, `PRODUCT_PUBLISH`).
 */
export async function getActiveMarketplaceAccountForConnector(
  id: string,
): Promise<{ account: MarketplaceAccountRecord; credential: string }> {
  const db = getDb();
  const account = await marketplaceAccountRepository.findById(db, id);
  if (!account || !account.active) throw new MarketplaceAccountNotFoundError();

  return { account, credential: await decryptCredential(account.credential) };
}
