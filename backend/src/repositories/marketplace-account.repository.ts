import { ObjectId, type Collection, type Db, type Filter } from "mongodb";
import type { Marketplace, ConnectionStatus } from "../schemas/marketplace-account.schema.js";

export interface MarketplaceAccountDocument {
  _id: ObjectId;
  marketplace: Marketplace;
  label: string;
  /** Sempre criptografado (spec 011, seção 3) — nunca texto puro nesta collection. */
  credential: string;
  credentialPreview: string;
  connectionStatus: ConnectionStatus;
  active: boolean;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  /** Fluxo OAuth em andamento (spec 012, seção 2.2): `state` aleatório de uso único, com validade
   * curta. Presente só entre "Conectar" e a volta do Mercado Livre; nunca exposto pela API. */
  oauthState?: string;
  oauthStateExpiresAt?: Date;
  /** PKCE: `code_verifier` do fluxo em andamento — vive e morre junto com o `state`. */
  oauthCodeVerifier?: string;
}

export interface MarketplaceAccountRecord {
  id: string;
  marketplace: Marketplace;
  label: string;
  credential: string;
  credentialPreview: string;
  connectionStatus: ConnectionStatus;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMarketplaceAccountRecordInput {
  marketplace: Marketplace;
  label: string;
  credential: string;
  credentialPreview: string;
  createdBy: string;
}

export interface UpdateMarketplaceAccountProfileInput {
  label?: string;
  credential?: string;
  credentialPreview?: string;
}

export interface ListMarketplaceAccountsOptions {
  marketplace?: Marketplace;
  active?: boolean;
}

function collection(db: Db): Collection<MarketplaceAccountDocument> {
  return db.collection<MarketplaceAccountDocument>("marketplace_accounts");
}

function toRecord(doc: MarketplaceAccountDocument): MarketplaceAccountRecord {
  return {
    id: doc._id.toHexString(),
    marketplace: doc.marketplace,
    label: doc.label,
    credential: doc.credential,
    credentialPreview: doc.credentialPreview,
    connectionStatus: doc.connectionStatus,
    active: doc.active,
    createdBy: doc.createdBy.toHexString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export const marketplaceAccountRepository = {
  async findById(db: Db, id: string): Promise<MarketplaceAccountRecord | null> {
    if (!ObjectId.isValid(id)) return null;
    const doc = await collection(db).findOne({ _id: new ObjectId(id) });
    return doc ? toRecord(doc) : null;
  },

  async list(db: Db, options: ListMarketplaceAccountsOptions = {}): Promise<MarketplaceAccountRecord[]> {
    const filter: Filter<MarketplaceAccountDocument> = {};
    if (options.marketplace !== undefined) filter.marketplace = options.marketplace;
    if (options.active !== undefined) filter.active = options.active;

    const docs = await collection(db).find(filter).sort({ createdAt: 1 }).toArray();
    return docs.map(toRecord);
  },

  async create(db: Db, input: CreateMarketplaceAccountRecordInput): Promise<MarketplaceAccountRecord> {
    const now = new Date();
    const doc: MarketplaceAccountDocument = {
      _id: new ObjectId(),
      marketplace: input.marketplace,
      label: input.label,
      credential: input.credential,
      credentialPreview: input.credentialPreview,
      connectionStatus: "disconnected",
      active: true,
      createdBy: new ObjectId(input.createdBy),
      createdAt: now,
      updatedAt: now,
    };
    await collection(db).insertOne(doc);
    return toRecord(doc);
  },

  async updateProfile(db: Db, id: string, input: UpdateMarketplaceAccountProfileInput): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    const patch: Partial<Pick<MarketplaceAccountDocument, "label" | "credential" | "credentialPreview">> = {};
    if (input.label !== undefined) patch.label = input.label;
    if (input.credential !== undefined) patch.credential = input.credential;
    if (input.credentialPreview !== undefined) patch.credentialPreview = input.credentialPreview;

    await collection(db).updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...patch, updatedAt: new Date() } },
    );
  },

  /**
   * Troca só o ciphertext (rotação de chave — spec 011, seção 3.1), condicionada ao valor que
   * foi lido: se a conta foi editada por um admin no meio da rotação, o filtro não casa e nada
   * é sobrescrito. Não mexe em `updatedAt` — rotação não é uma edição da conta.
   */
  async replaceCredentialCiphertext(db: Db, id: string, expected: string, next: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await collection(db).updateOne(
      { _id: new ObjectId(id), credential: expected },
      { $set: { credential: next } },
    );
    return result.modifiedCount === 1;
  },

  async setOAuthState(db: Db, id: string, state: string, expiresAt: Date, codeVerifier: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await collection(db).updateOne(
      { _id: new ObjectId(id) },
      { $set: { oauthState: state, oauthStateExpiresAt: expiresAt, oauthCodeVerifier: codeVerifier } },
    );
  },

  /**
   * Consome o `state` de forma **atômica** (uso único): quem chega primeiro leva a conta e o
   * `state` some — replay e duas abas simultâneas não passam duas vezes. Devolve também a validade
   * (lida antes de apagar) para o chamador rejeitar um `state` expirado.
   */
  async consumeOAuthState(
    db: Db,
    state: string,
  ): Promise<{ account: MarketplaceAccountRecord; expiresAt: Date | undefined; codeVerifier: string | undefined } | null> {
    const doc = await collection(db).findOneAndUpdate(
      { oauthState: state },
      { $unset: { oauthState: "", oauthStateExpiresAt: "", oauthCodeVerifier: "" } },
      { returnDocument: "before" },
    );
    return doc
      ? { account: toRecord(doc), expiresAt: doc.oauthStateExpiresAt, codeVerifier: doc.oauthCodeVerifier }
      : null;
  },

  /** Grava a credencial completa (com tokens) e marca a conta como conectada. */
  async saveConnectedCredential(db: Db, id: string, credential: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await collection(db).updateOne(
      { _id: new ObjectId(id) },
      { $set: { credential, connectionStatus: "connected", updatedAt: new Date() } },
    );
  },

  async updateStatus(db: Db, id: string, active: boolean): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await collection(db).updateOne(
      { _id: new ObjectId(id) },
      { $set: { active, updatedAt: new Date() } },
    );
  },

  /**
   * Desconecta a conta (spec 011, seção 2.2.2). Grava, se houver, a credencial já sem tokens e
   * remove um `state` de OAuth pendente — senão um retorno do Mercado Livre que ainda estivesse
   * a caminho reconectaria uma conta que o admin acabou de desconectar.
   */
  async markDisconnected(db: Db, id: string, credentialWithoutTokens?: string): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await collection(db).updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          connectionStatus: "disconnected",
          updatedAt: new Date(),
          ...(credentialWithoutTokens !== undefined ? { credential: credentialWithoutTokens } : {}),
        },
        $unset: { oauthState: "", oauthStateExpiresAt: "", oauthCodeVerifier: "" },
      },
    );
  },

  /** Remoção física (ADR-022) — só o serviço, depois de validar a ordem Desconectar → Desativar. */
  async delete(db: Db, id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await collection(db).deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  },

  async updateConnectionStatus(db: Db, id: string, connectionStatus: ConnectionStatus): Promise<void> {
    if (!ObjectId.isValid(id)) return;
    await collection(db).updateOne(
      { _id: new ObjectId(id) },
      { $set: { connectionStatus, updatedAt: new Date() } },
    );
  },
};
