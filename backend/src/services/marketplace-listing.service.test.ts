import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../schemas/product.schema.js";
import type { MarketplaceAccountRecord } from "../repositories/marketplace-account.repository.js";

const getProductByIdMock = vi.fn();
const getActiveAccountMock = vi.fn();
const upsertListingMock = vi.fn();
const recordMock = vi.fn();
const publishMock = vi.fn();

vi.mock("./product.service.js", () => ({
  getProductById: (...args: unknown[]) => getProductByIdMock(...args),
}));

vi.mock("./marketplace-account.service.js", () => ({
  getActiveMarketplaceAccountForConnector: (...args: unknown[]) => getActiveAccountMock(...args),
}));

vi.mock("../repositories/product.repository.js", () => ({
  productRepository: {
    upsertMarketplaceListing: (...args: unknown[]) => upsertListingMock(...args),
  },
}));

vi.mock("./audit-log.service.js", () => ({
  record: (...args: unknown[]) => recordMock(...args),
}));

vi.mock("../database/mongo.client.js", () => ({
  getDb: () => ({}),
}));

const {
  publishListing,
  setMarketplaceConnectorForTesting,
  ProductMissingRequiredFieldsError,
  MarketplaceAccountMismatchError,
} = await import("./marketplace-listing.service.js");

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    sku: "BVI-BERM-000001",
    status: "disponivel",
    identificacao: { nome: "Bermuda Jeans", descricao: null, peca_unica: true, quantidade: 1, data_cadastro: new Date() },
    classificacao: {
      categoria_codigo: "BERM",
      categoria: "Bermudas",
      subcategoria: null,
      departamento: "Masculino",
      estilo: [],
      ocasiao: [],
      estacao: [],
    },
    marca: { nome: null, original: null },
    caracteristicas: {
      tamanho_etiqueta: null,
      tamanho_equivalente: null,
      cor_principal: null,
      cores_secundarias: [],
      estampa: null,
      material: [],
      composicao: null,
      lavagem: null,
      modelagem: null,
      elasticidade: null,
      fechamento: [],
    },
    medidas: { unidade: "cm", cintura: null, quadril: null, gancho: null, comprimento: null, largura_barra: null },
    peso: { valor: null, unidade: "kg" },
    condicao: { estado: "novo", nota: null, possui_etiqueta: false, possui_defeitos: false, defeitos: [], observacoes: null },
    preco: { preco_original_estimado: null, custo_aquisicao: null, preco_venda: 129.9, preco_promocional: null, moeda: "BRL" },
    estoque: { quantidade: 1, localizacao: { loja: "Loja Principal", setor: null, arara: null, posicao: null } },
    imagens: { principal: { id: "img1", url: "https://example.com/1.jpg", ordem: 0, tipo: null }, galeria: [{ id: "img1", url: "https://example.com/1.jpg", ordem: 0, tipo: null }] },
    ecommerce: { publicado: false, slug: "bermuda-jeans", titulo_seo: null, tags: [] },
    marketplaces: [],
    venda: { vendido: false, data_venda: null, canal_venda: null, valor_venda: null },
    ai_metadata: { generated: false, model: null, generated_at: null, fields: {} },
    auditoria: { criado_por: "user-1", criado_em: new Date(), atualizado_por: "user-1", atualizado_em: new Date() },
    ...overrides,
  };
}

function makeAccount(overrides: Partial<MarketplaceAccountRecord> = {}): MarketplaceAccountRecord {
  return {
    id: "acc-1",
    marketplace: "mercado_livre",
    label: "Vovó Isabel - Loja 1",
    credential: "encrypted",
    credentialPreview: "****cdef",
    connectionStatus: "connected",
    active: true,
    createdBy: "admin-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  getProductByIdMock.mockReset();
  getActiveAccountMock.mockReset();
  upsertListingMock.mockReset().mockResolvedValue(undefined);
  recordMock.mockReset().mockResolvedValue(undefined);
  publishMock.mockReset();
  setMarketplaceConnectorForTesting({ publish: (...args: unknown[]) => publishMock(...args) });
});

describe("marketplace-listing.service.publishListing", () => {
  it("bloqueia publicação sem dados mínimos, sem chamar a conta nem o conector", async () => {
    getProductByIdMock.mockResolvedValue(makeProduct({ preco: { ...makeProduct().preco, preco_venda: null } }));

    await expect(
      publishListing({ productId: "prod-1", marketplace: "mercado_livre", accountId: "acc-1", actingUserId: "u1" }),
    ).rejects.toThrow(ProductMissingRequiredFieldsError);

    expect(getActiveAccountMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
    expect(upsertListingMock).not.toHaveBeenCalled();
  });

  it("bloqueia publicação sem nenhuma foto", async () => {
    getProductByIdMock.mockResolvedValue(makeProduct({ imagens: { principal: null, galeria: [] } }));

    await expect(
      publishListing({ productId: "prod-1", marketplace: "mercado_livre", accountId: "acc-1", actingUserId: "u1" }),
    ).rejects.toThrow(ProductMissingRequiredFieldsError);
  });

  it("rejeita quando a conta não pertence ao marketplace escolhido", async () => {
    getProductByIdMock.mockResolvedValue(makeProduct());
    getActiveAccountMock.mockResolvedValue({ account: makeAccount({ marketplace: "shopee" }), credential: "plain" });

    await expect(
      publishListing({ productId: "prod-1", marketplace: "mercado_livre", accountId: "acc-1", actingUserId: "u1" }),
    ).rejects.toThrow(MarketplaceAccountMismatchError);

    expect(publishMock).not.toHaveBeenCalled();
  });

  it("publicação bem-sucedida grava status=publicado e audita sucesso", async () => {
    getProductByIdMock.mockResolvedValue(makeProduct());
    getActiveAccountMock.mockResolvedValue({ account: makeAccount(), credential: "plain-credential" });
    publishMock.mockResolvedValue({ id_anuncio: "MLB123", url_anuncio: "https://example.com/MLB123" });

    await publishListing({ productId: "prod-1", marketplace: "mercado_livre", accountId: "acc-1", actingUserId: "u1" });

    expect(publishMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), "plain-credential");
    expect(upsertListingMock).toHaveBeenCalledWith(
      expect.anything(),
      "prod-1",
      expect.objectContaining({ status: "publicado", id_anuncio: "MLB123", erro: null }),
    );
    expect(recordMock).toHaveBeenCalledWith(
      "PRODUCT_PUBLISH",
      "product",
      "prod-1",
      "u1",
      expect.objectContaining({ success: true }),
    );
  });

  it("falha do conector grava status=erro sem lançar, e nunca inclui a credencial na mensagem", async () => {
    getProductByIdMock.mockResolvedValue(makeProduct());
    getActiveAccountMock.mockResolvedValue({ account: makeAccount(), credential: "plain-credential" });
    publishMock.mockRejectedValue(new Error("Credencial expirada"));

    const result = await publishListing({
      productId: "prod-1",
      marketplace: "mercado_livre",
      accountId: "acc-1",
      actingUserId: "u1",
    });

    expect(result).toBeDefined();
    expect(upsertListingMock).toHaveBeenCalledWith(
      expect.anything(),
      "prod-1",
      expect.objectContaining({ status: "erro", erro: "Credencial expirada" }),
    );
    expect(recordMock).toHaveBeenCalledWith(
      "PRODUCT_PUBLISH",
      "product",
      "prod-1",
      "u1",
      expect.objectContaining({ success: false }),
    );
  });
});
