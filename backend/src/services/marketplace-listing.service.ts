import { getDb } from "../database/mongo.client.js";
import { productRepository } from "../repositories/product.repository.js";
import { getProductById } from "./product.service.js";
import { getActiveMarketplaceAccountForConnector } from "./marketplace-account.service.js";
import type { Marketplace } from "../schemas/marketplace-account.schema.js";
import type { Product } from "../schemas/product.schema.js";
import type { MarketplaceConnectorPort } from "../plugins/marketplaces/marketplace-connector.port.js";
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

let connector: MarketplaceConnectorPort | undefined;

/**
 * Nenhum adapter concreto (Mercado Livre, Shopee, eBay) é registrado por padrão nesta spec
 * (011) — implementação real fica a cargo da spec de cada conector (012+, spec 011 seção 5).
 * Chamar `publishListing` sem antes injetar um conector real (produção) ou um dublê (teste)
 * lança um erro claro — nunca falha silenciosa nem finge sucesso.
 */
function getConnector(): MarketplaceConnectorPort {
  if (!connector) {
    throw new Error(
      "Nenhum conector de marketplace configurado — a implementação concreta é escopo de uma spec própria por marketplace (011, seção 5).",
    );
  }
  return connector;
}

/** Seam de teste/produção — injeta o adapter concreto de um conector (ou um dublê de teste). */
export function setMarketplaceConnectorForTesting(fake: MarketplaceConnectorPort): void {
  connector = fake;
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

  try {
    const result = await getConnector().publish(product, account, credential);

    await productRepository.upsertMarketplaceListing(db, input.productId, {
      marketplace: input.marketplace,
      conta_id: account.id,
      conta_apelido: account.label,
      status: "publicado",
      id_anuncio: result.id_anuncio,
      url_anuncio: result.url_anuncio,
      publicado_em: new Date(),
      encerrado_em: null,
      erro: null,
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
