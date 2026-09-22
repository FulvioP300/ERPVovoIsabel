import { getDb } from "../database/mongo.client.js";
import { productRepository } from "../repositories/product.repository.js";
import { getProductById } from "./product.service.js";
import { getActiveMarketplaceAccountForConnector } from "./marketplace-account.service.js";
import type { Marketplace } from "../schemas/marketplace-account.schema.js";
import type { Product } from "../schemas/product.schema.js";
import { getConnector, setMarketplaceConnectorForTesting } from "../plugins/marketplaces/connector-registry.js";
import type { ConnectorAccount } from "../plugins/marketplaces/marketplace-connector.port.js";
import type { MarketplaceAccountRecord } from "../repositories/marketplace-account.repository.js";
import { record } from "./audit-log.service.js";

export class ProductMissingRequiredFieldsError extends Error {
  constructor(missing: string[]) {
    super(`Dados mínimos incompletos para publicar: ${missing.join(", ")}.`);
    this.name = "ProductMissingRequiredFieldsError";
  }
}

export class MarketplaceAccountMismatchError extends Error {
  constructor() {
    super("A conta escolhida não pertence ao marketplace selecionado.");
    this.name = "MarketplaceAccountMismatchError";
  }
}

/**
 * O conector de cada marketplace vem do registro (`plugins/marketplaces/connector-registry.ts`). Um
 * marketplace sem conector **não finge sucesso**: `getConnector` lança um erro claro, que
 * `publishListing` grava como `erro` na entrada (spec 011, seção 4.6). O seam de teste segue
 * exportado daqui para não mexer nos testes existentes.
 */
export { setMarketplaceConnectorForTesting };

/** A conta como o conector a vê: sem a credencial cifrada (ela chega decifrada, à parte). */
function toConnectorAccount(account: MarketplaceAccountRecord): ConnectorAccount {
  return {
    id: account.id,
    marketplace: account.marketplace,
    label: account.label,
    credentialPreview: account.credentialPreview,
    connectionStatus: account.connectionStatus,
    active: account.active,
    expectedUser: account.expectedUser,
    connectedNickname: account.connectedNickname,
    createdBy: account.createdBy,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/** Dados mínimos obrigatórios para publicar (spec 011, seção 4.6). */
function assertMinimumProductData(product: Product): void {
  const missing: string[] = [];
  if (!product.identificacao.nome?.trim()) missing.push("nome");
  if (!product.classificacao.categoria_codigo) missing.push("categoria");
  if (product.preco.preco_venda === null || product.preco.preco_venda === undefined) {
    missing.push("preço de venda");
  }
  if (product.imagens.galeria.length === 0) missing.push("ao menos uma foto");

  if (missing.length > 0) {
    throw new ProductMissingRequiredFieldsError(missing);
  }
}

export interface PublishListingInput {
  productId: string;
  marketplace: Marketplace;
  accountId: string;
  actingUserId: string;
}

/**
 * Publica (ou retenta) uma publicação de produto num marketplace, através da conta escolhida.
 * Falha do conector nunca é silenciosa (spec 011, seção 4.6): grava `status = erro` e `erro`
 * preenchido na entrada correspondente, sem lançar para o chamador — a falha é um resultado de
 * negócio válido, não uma exceção da rota.
 */
export async function publishListing(input: PublishListingInput): Promise<Product> {
  const product = await getProductById(input.productId);
  assertMinimumProductData(product);

  const { account, credential } = await getActiveMarketplaceAccountForConnector(input.accountId);
  if (account.marketplace !== input.marketplace) {
    throw new MarketplaceAccountMismatchError();
  }

  const db = getDb();

  // Entrada atual desta conta no produto: é ela que o conector usa para decidir criar × atualizar
  // (spec 012, seção 3.1).
  const existing =
    product.marketplaces.find((l) => l.marketplace === input.marketplace && l.conta_id === account.id) ?? null;

  try {
    const { value: result } = await getConnector(input.marketplace).publish({
      product,
      listing: existing,
      account: toConnectorAccount(account),
      credential,
    });

    await productRepository.upsertMarketplaceListing(db, input.productId, {
      marketplace: input.marketplace,
      conta_id: account.id,
      conta_apelido: account.label,
      status: "publicado",
      id_anuncio: result.id_anuncio,
      url_anuncio: result.url_anuncio,
      publicado_em: new Date(),
      encerrado_em: null,
      // Pendência com o anúncio no ar (ex.: descrição não enviada) — spec 012, seção 3.1.
      erro: result.pendencia,
    });

    await record("PRODUCT_PUBLISH", "product", input.productId, input.actingUserId, {
      marketplace: input.marketplace,
      accountId: account.id,
      success: true,
    });
  } catch (err) {
    // Nunca logar `credential` (spec 011, seção 3) — só a mensagem de erro do conector.
    const message = err instanceof Error ? err.message : "Falha desconhecida ao publicar.";

    await productRepository.upsertMarketplaceListing(db, input.productId, {
      marketplace: input.marketplace,
      conta_id: account.id,
      conta_apelido: account.label,
      status: "erro",
      id_anuncio: null,
      url_anuncio: null,
      publicado_em: null,
      encerrado_em: null,
      erro: message,
    });

    await record("PRODUCT_PUBLISH", "product", input.productId, input.actingUserId, {
      marketplace: input.marketplace,
      accountId: account.id,
      success: false,
      error: message,
    });
  }

  return getProductById(input.productId);
}
