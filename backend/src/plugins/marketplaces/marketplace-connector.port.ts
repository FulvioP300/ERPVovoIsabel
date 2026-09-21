import type { Product } from "../../schemas/product.schema.js";
import type { MarketplaceAccount } from "../../schemas/marketplace-account.schema.js";

/**
 * Porta de abstração de conectores de marketplace (constituição, princípio VI; spec 011,
 * seção 4.1). Nenhuma camada de domínio ou serviço deve conhecer o SDK/API de um marketplace
 * concreto — apenas este contrato. Superfície mínima, deliberada (mesmo espírito da spec 006,
 * seção 8.2, defesa E): só publicar um anúncio, nenhuma capacidade de function/tool calling ou
 * ação autônoma além disso.
 *
 * Nenhum adapter concreto (Mercado Livre, Shopee, eBay) é implementado nesta spec — cada um
 * vira uma spec própria (012+, spec 011 seção 5).
 */

/** Conta como o conector a vê — sem o `publishedListingsCount`, que é só de apresentação. */
export type ConnectorAccount = Omit<MarketplaceAccount, "publishedListingsCount">;

export interface MarketplacePublishResult {
  id_anuncio: string;
  url_anuncio: string;
}

export interface MarketplaceConnectorPort {
  /**
   * Publica o produto no marketplace usando a credencial (já decriptada) da conta escolhida.
   * `credential` nunca é logada pelo adapter (spec 011, seção 3) — falhas devem lançar um erro
   * com uma mensagem que descreva o tipo do problema, nunca o valor da credencial usada.
   */
  publish(product: Product, account: ConnectorAccount, credential: string): Promise<MarketplacePublishResult>;
}
