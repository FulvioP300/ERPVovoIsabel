import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../../schemas/product.schema.js";
import type { CategoryAttribute } from "./mercado-livre-api.client.js";
import type { MarketplaceListing } from "../../../../shared/dist/schemas/marketplace.schema.js";
import type { ConnectorAccount, PublishInput } from "./marketplace-connector.port.js";

const fetchCurrentUserMock = vi.fn();
const resolvePackageMock = vi.fn();

const apiMocks = {
  getCategory: vi.fn(),
  getCategoryAttributes: vi.fn(),
  getConditionallyRequiredAttributes: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  getItem: vi.fn(),
  getItemsByIds: vi.fn(),
  createDescription: vi.fn(),
  updateDescription: vi.fn(),
  searchItemsBySellerSku: vi.fn(),
  getActiveSizeChartDomains: vi.fn(),
  getDomainSizeChartAttributes: vi.fn(),
  searchSizeCharts: vi.fn(),
  getSizeChart: vi.fn(),
  createSizeChart: vi.fn(),
  addSizeChartRow: vi.fn(),
};

vi.mock("../../database/mongo.client.js", () => ({ getDb: () => ({}) }));

vi.mock("./mercado-livre-oauth.client.js", async () => {
  const actual = await vi.importActual<typeof import("./mercado-livre-oauth.client.js")>("./mercado-livre-oauth.client.js");
  return { ...actual, mercadoLivreOAuthClient: { fetchCurrentUser: (...args: unknown[]) => fetchCurrentUserMock(...args) } };
});

vi.mock("./mercado-livre-package.config.js", async () => {
  const actual = await vi.importActual<typeof import("./mercado-livre-package.config.js")>("./mercado-livre-package.config.js");
  return { ...actual, resolvePackage: (...args: unknown[]) => resolvePackageMock(...args) };
});

vi.mock("./mercado-livre-api.client.js", async () => {
  const actual = await vi.importActual<typeof import("./mercado-livre-api.client.js")>("./mercado-livre-api.client.js");
  return { ...actual, ...apiMocks };
});

const { publishItem } = await import("./mercado-livre-publish.js");
const { PriceOutOfRangeError } = await import("./mercado-livre-item.mapper.js");
const { MercadoLivreApiError } = await import("./mercado-livre-api.client.js");

const ACCESS_TOKEN = "ACCESS-TOKEN";

const ACCOUNT: ConnectorAccount = {
  id: "acc-1",
  marketplace: "mercado_livre",
  label: "Loja",
  credentialPreview: "****3906",
  connectionStatus: "connected",
  active: true,
  expectedUser: "VOVOISABEL",
  connectedNickname: "VOVOISABEL",
  createdBy: "admin-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function attr(overrides: Partial<CategoryAttribute> = {}): CategoryAttribute {
  return {
    id: "SOME_ATTR",
    name: "Some attr",
    valueType: "string",
    tags: {
      required: false,
      newRequired: false,
      conditionalRequired: false,
      readOnly: false,
      fixed: false,
      inferred: false,
      hidden: false,
      multivalued: false,
      gridFilter: false,
      gridTemplateRequired: false,
    },
    values: [],
    ...overrides,
  };
}

const CATEGORY_ATTRIBUTES: CategoryAttribute[] = [
  attr({
    id: "ITEM_CONDITION",
    values: [
      { id: "2230284", name: "Novo" },
      { id: "2230581", name: "Usado" },
    ],
  }),
  attr({ id: "SELLER_SKU" }),
  attr({ id: "SELLER_PACKAGE_HEIGHT" }),
  attr({ id: "SELLER_PACKAGE_WIDTH" }),
  attr({ id: "SELLER_PACKAGE_LENGTH" }),
  attr({ id: "SELLER_PACKAGE_WEIGHT" }),
  attr({ id: "BRAND" }),
  attr({ id: "MAIN_COLOR" }),
  attr({ id: "GENDER", values: [{ id: "g1", name: "Masculino" }, { id: "g2", name: "Feminino" }] }),
  attr({ id: "SIZE" }),
  attr({ id: "SIZE_GRID_ID" }),
  attr({ id: "SIZE_GRID_ROW_ID" }),
  attr({ id: "GARMENT_WAIST_WIDTH_FROM" }),
  attr({ id: "GARMENT_HIP_WIDTH_FROM" }),
];

const CATEGORY_SETTINGS = {
  maxTitleLength: 60,
  minimumPrice: 10,
  maximumPrice: null,
  maxPicturesPerItem: 12,
  maxDescriptionLength: 50000,
  immediatePayment: undefined,
  listingAllowed: true,
  status: "enabled",
  catalogDomain: undefined,
};

const RESOLVED_PACKAGE = { altura_cm: 10, largura_cm: 30, comprimento_cm: 40, peso_g: 300 };

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    sku: "BVI-BERM-000001",
    status: "disponivel",
    identificacao: { nome: "Bermuda Jeans", descricao: "Bermuda em ótimo estado.", peca_unica: true, quantidade: 1, data_cadastro: new Date() },
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
      tamanho_etiqueta: "42",
      tamanho_equivalente: null,
      genero: null,
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
    medidas: { unidade: "cm", cintura: 80, quadril: 100, gancho: 25, comprimento: 45, largura_barra: null, coxa: 60, entrepasso: 70 },
    peso: { valor: 0.3, unidade: "kg" },
    condicao: { estado: "usado", nota: null, possui_etiqueta: false, possui_defeitos: false, defeitos: [], observacoes: null },
    preco: { preco_original_estimado: null, custo_aquisicao: null, preco_venda: 89.9, preco_promocional: null, moeda: "BRL" },
    estoque: { quantidade: 1, localizacao: { loja: "Loja Principal", setor: null, arara: null, posicao: null } },
    imagens: {
      principal: { id: "img1", url: "https://x/1.jpg", ordem: 0, tipo: null },
      galeria: [{ id: "img1", url: "https://x/1.jpg", ordem: 0, tipo: null }],
    },
    ecommerce: { publicado: false, slug: "bermuda-jeans", titulo_seo: null, tags: [] },
    marketplaces: [],
    venda: { vendido: false, data_venda: null, canal_venda: null, valor_venda: null },
    ai_metadata: { generated: false, model: null, generated_at: null, fields: {} },
    auditoria: { criado_por: "user-1", criado_em: new Date(), atualizado_por: "user-1", atualizado_em: new Date() },
    ...overrides,
  };
}

function makeListing(overrides: Partial<MarketplaceListing> = {}): MarketplaceListing {
  return {
    marketplace: "mercado_livre",
    conta_id: "acc-1",
    conta_apelido: "Loja",
    status: "publicado",
    id_anuncio: "MLB123",
    url_anuncio: "https://produto.mercadolivre.com.br/MLB-123",
    publicado_em: new Date(),
    encerrado_em: null,
    erro: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<PublishInput> = {}): PublishInput {
  return {
    product: makeProduct(),
    listing: null,
    account: ACCOUNT,
    credential: "plain-credential",
    categoryId: "MLB188064",
    listingTypeId: "free",
    ...overrides,
  };
}

beforeEach(() => {
  fetchCurrentUserMock.mockReset().mockResolvedValue({ id: 987654, nickname: "VOVOISABEL", tags: [] });
  resolvePackageMock.mockReset().mockResolvedValue(RESOLVED_PACKAGE);
  for (const mock of Object.values(apiMocks)) mock.mockReset();

  apiMocks.getCategory.mockResolvedValue(CATEGORY_SETTINGS);
  apiMocks.getCategoryAttributes.mockResolvedValue(CATEGORY_ATTRIBUTES);
  apiMocks.searchItemsBySellerSku.mockResolvedValue([]);
  apiMocks.createItem.mockResolvedValue({ id: "MLB999", permalink: "https://produto.mercadolivre.com.br/MLB-999", status: "active", warnings: [] });
  apiMocks.updateItem.mockResolvedValue({ id: "MLB123", permalink: "https://produto.mercadolivre.com.br/MLB-123", status: "active", warnings: [] });
  apiMocks.getItem.mockResolvedValue({ id: "MLB123", status: "active", soldQuantity: 0, categoryId: "MLB188064", permalink: "https://x/MLB-123" });
  apiMocks.createDescription.mockResolvedValue(undefined);
  apiMocks.updateDescription.mockResolvedValue(undefined);
});

describe("publishItem — validação antes de qualquer chamada de escrita (spec 012, seções 4, 6)", () => {
  it("sem categoryId: erro claro, sem chamar a API", async () => {
    await expect(publishItem(ACCESS_TOKEN, makeInput({ categoryId: null }))).rejects.toThrow(/Nenhuma categoria confirmada/);
    expect(apiMocks.getCategory).not.toHaveBeenCalled();
  });

  it("sem listingTypeId: erro claro, sem chamar a API", async () => {
    await expect(publishItem(ACCESS_TOKEN, makeInput({ listingTypeId: null }))).rejects.toThrow(/Nenhum tipo de anúncio/);
    expect(apiMocks.getCategory).not.toHaveBeenCalled();
  });

  it("categoria sem listing_allowed: erro claro, sem tentar publicar", async () => {
    apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, listingAllowed: false });
    await expect(publishItem(ACCESS_TOKEN, makeInput())).rejects.toThrow(/não aceita novos anúncios/);
    expect(apiMocks.createItem).not.toHaveBeenCalled();
  });

  it("preço fora da faixa da categoria: PriceOutOfRangeError, sem tentar publicar", async () => {
    apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, minimumPrice: 200 });
    await expect(publishItem(ACCESS_TOKEN, makeInput())).rejects.toThrow(PriceOutOfRangeError);
    expect(apiMocks.createItem).not.toHaveBeenCalled();
  });
});

describe("publishItem — criar (spec 012, seção 3.1)", () => {
  it("modelo User Products: family_name no payload, nunca title", async () => {
    fetchCurrentUserMock.mockResolvedValue({ id: 987654, nickname: "VOVOISABEL", tags: ["user_product_seller"] });

    await publishItem(ACCESS_TOKEN, makeInput());

    const payload = apiMocks.createItem.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).toMatchObject({ family_name: "Bermuda Jeans", category_id: "MLB188064", listing_type_id: "free" });
    expect(payload).not.toHaveProperty("title");
  });

  it("modelo antigo (sem a tag): title no payload", async () => {
    await publishItem(ACCESS_TOKEN, makeInput());
    const payload = apiMocks.createItem.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).toMatchObject({ title: "Bermuda Jeans" });
  });

  it("inclui SKU, condição e pacote nos atributos", async () => {
    await publishItem(ACCESS_TOKEN, makeInput());
    const payload = apiMocks.createItem.mock.calls[0]![1] as { attributes: { id: string }[] };
    const ids = payload.attributes.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(["SELLER_SKU", "ITEM_CONDITION", "SELLER_PACKAGE_HEIGHT", "SELLER_PACKAGE_WEIGHT"]),
    );
  });

  it("categoria com MODEL: reaproveita identificacao.nome (T043 — 'Cintos'/'Bolsas' exigem MODEL, ERP não tem esse campo)", async () => {
    apiMocks.getCategoryAttributes.mockResolvedValue([...CATEGORY_ATTRIBUTES, attr({ id: "MODEL" })]);

    await publishItem(ACCESS_TOKEN, makeInput());

    const payload = apiMocks.createItem.mock.calls[0]![1] as { attributes: { id: string; value_name?: string }[] };
    expect(payload.attributes).toEqual(expect.arrayContaining([{ id: "MODEL", value_name: "Bermuda Jeans" }]));
  });

  it("sucesso: devolve id_anuncio e url_anuncio, pendencia null", async () => {
    const result = await publishItem(ACCESS_TOKEN, makeInput());
    expect(result).toEqual({ id_anuncio: "MLB999", url_anuncio: "https://produto.mercadolivre.com.br/MLB-999", pendencia: null });
  });

  it("envia a descrição depois de criar o item", async () => {
    await publishItem(ACCESS_TOKEN, makeInput());
    expect(apiMocks.createDescription).toHaveBeenCalledWith(ACCESS_TOKEN, "MLB999", "Bermuda em ótimo estado.");
  });

  it("sem descrição no produto: não chama createDescription", async () => {
    await publishItem(ACCESS_TOKEN, makeInput({ product: makeProduct({ identificacao: { ...makeProduct().identificacao, descricao: null } }) }));
    expect(apiMocks.createDescription).not.toHaveBeenCalled();
  });

  it("descrição falha: pendência 'Anúncio criado, mas a descrição não foi enviada', item some jeito publicado", async () => {
    apiMocks.createDescription.mockRejectedValue(new MercadoLivreApiError("Texto inválido.", 400, "item.description.type.invalid"));

    const result = await publishItem(ACCESS_TOKEN, makeInput());

    expect(result.id_anuncio).toBe("MLB999");
    expect(result.pendencia).toContain("Anúncio criado, mas a descrição não foi enviada: Texto inválido.");
  });

  it("warnings da resposta de criação viram pendência", async () => {
    apiMocks.createItem.mockResolvedValue({
      id: "MLB999",
      permalink: "https://x/MLB-999",
      status: "active",
      warnings: [{ code: "w1", message: "Atributo recomendado ausente." }],
    });

    const result = await publishItem(ACCESS_TOKEN, makeInput({ product: makeProduct({ identificacao: { ...makeProduct().identificacao, descricao: null } }) }));

    expect(result.pendencia).toBe("Atributo recomendado ausente.");
  });

  it("resposta perdida: acha item existente pelo SKU (não closed) e ATUALIZA em vez de criar de novo", async () => {
    apiMocks.searchItemsBySellerSku.mockResolvedValue(["MLB777"]);
    apiMocks.getItemsByIds.mockResolvedValue([{ id: "MLB777", status: "active", soldQuantity: 0, categoryId: "MLB188064", permalink: "https://x/MLB-777" }]);
    apiMocks.getItem.mockResolvedValue({ id: "MLB777", status: "active", soldQuantity: 0, categoryId: "MLB188064", permalink: "https://x/MLB-777" });

    const result = await publishItem(ACCESS_TOKEN, makeInput());

    expect(apiMocks.createItem).not.toHaveBeenCalled();
    expect(apiMocks.updateItem).toHaveBeenCalledWith(ACCESS_TOKEN, "MLB777", expect.anything());
    expect(result.id_anuncio).toBe("MLB777");
  });

  it("resposta perdida: ignora itens closed na busca por SKU", async () => {
    apiMocks.searchItemsBySellerSku.mockResolvedValue(["MLB-CLOSED"]);
    apiMocks.getItemsByIds.mockResolvedValue([{ id: "MLB-CLOSED", status: "closed", soldQuantity: 1, categoryId: "MLB188064", permalink: "https://x/closed" }]);

    await publishItem(ACCESS_TOKEN, makeInput());

    expect(apiMocks.createItem).toHaveBeenCalled();
    expect(apiMocks.updateItem).not.toHaveBeenCalled();
  });
});

describe("publishItem — atualizar / republicar (spec 012, seção 3.1)", () => {
  it("id_anuncio presente e status publicado: chama updateItem, não createItem", async () => {
    await publishItem(ACCESS_TOKEN, makeInput({ listing: makeListing({ status: "publicado", id_anuncio: "MLB123" }) }));
    expect(apiMocks.updateItem).toHaveBeenCalledWith(ACCESS_TOKEN, "MLB123", expect.anything());
    expect(apiMocks.createItem).not.toHaveBeenCalled();
  });

  it("id_anuncio presente e status encerrado: CRIA de novo (não atualiza o antigo)", async () => {
    await publishItem(ACCESS_TOKEN, makeInput({ listing: makeListing({ status: "encerrado", id_anuncio: "MLB-OLD" }) }));
    expect(apiMocks.createItem).toHaveBeenCalled();
    expect(apiMocks.updateItem).not.toHaveBeenCalled();
  });

  it("item já closed no Mercado Livre: erro orientando encerrar pelo ERP", async () => {
    apiMocks.getItem.mockResolvedValue({ id: "MLB123", status: "closed", soldQuantity: 2, categoryId: "MLB188064", permalink: undefined });
    await expect(publishItem(ACCESS_TOKEN, makeInput({ listing: makeListing() }))).rejects.toThrow(/Encerrar anúncio/);
    expect(apiMocks.updateItem).not.toHaveBeenCalled();
  });

  it("com vendas (sold_quantity > 0): não reenvia family_name/title", async () => {
    fetchCurrentUserMock.mockResolvedValue({ id: 987654, nickname: "VOVOISABEL", tags: ["user_product_seller"] });
    apiMocks.getItem.mockResolvedValue({ id: "MLB123", status: "active", soldQuantity: 3, categoryId: "MLB188064", permalink: "https://x/MLB-123" });

    await publishItem(ACCESS_TOKEN, makeInput({ listing: makeListing() }));

    const payload = apiMocks.updateItem.mock.calls[0]![2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("family_name");
    expect(payload).not.toHaveProperty("title");
  });

  it("sempre reenvia pictures e price na atualização", async () => {
    await publishItem(ACCESS_TOKEN, makeInput({ listing: makeListing() }));
    const payload = apiMocks.updateItem.mock.calls[0]![2] as Record<string, unknown>;
    expect(payload).toMatchObject({ price: 89.9, pictures: [{ source: "https://x/1.jpg" }] });
  });

  it("atualiza a descrição via PUT", async () => {
    await publishItem(ACCESS_TOKEN, makeInput({ listing: makeListing() }));
    expect(apiMocks.updateDescription).toHaveBeenCalledWith(ACCESS_TOKEN, "MLB123", "Bermuda em ótimo estado.");
    expect(apiMocks.createDescription).not.toHaveBeenCalled();
  });

  it("PUT da descrição falha (sem descrição ainda): tenta POST em seguida", async () => {
    apiMocks.updateDescription.mockRejectedValue(new MercadoLivreApiError("Não encontrada.", 404, undefined));

    await publishItem(ACCESS_TOKEN, makeInput({ listing: makeListing() }));

    expect(apiMocks.createDescription).toHaveBeenCalledWith(ACCESS_TOKEN, "MLB123", "Bermuda em ótimo estado.");
  });

  it("PUT e POST da descrição falham: pendência descreve o motivo, sem lançar", async () => {
    apiMocks.updateDescription.mockRejectedValue(new MercadoLivreApiError("Não encontrada.", 404, undefined));
    apiMocks.createDescription.mockRejectedValue(new MercadoLivreApiError("Texto inválido.", 400, undefined));

    const result = await publishItem(ACCESS_TOKEN, makeInput({ listing: makeListing() }));

    expect(result.pendencia).toContain("Texto inválido.");
  });

  it("warning de preço ignorado vira pendência, anúncio segue publicado", async () => {
    apiMocks.updateItem.mockResolvedValue({
      id: "MLB123",
      permalink: "https://x/MLB-123",
      status: "active",
      warnings: [{ code: "price_ignored", message: "O preço não foi atualizado." }],
    });

    const result = await publishItem(
      ACCESS_TOKEN,
      makeInput({ listing: makeListing(), product: makeProduct({ identificacao: { ...makeProduct().identificacao, descricao: null } }) }),
    );

    expect(result.pendencia).toBe("O preço não foi atualizado.");
  });

  it("permalink ausente na resposta do PUT: usa o permalink do GET anterior", async () => {
    apiMocks.updateItem.mockResolvedValue({ id: "MLB123", permalink: undefined, status: "active", warnings: [] });
    const result = await publishItem(
      ACCESS_TOKEN,
      makeInput({ listing: makeListing(), product: makeProduct({ identificacao: { ...makeProduct().identificacao, descricao: null } }) }),
    );
    expect(result.url_anuncio).toBe("https://x/MLB-123");
  });
});

describe("publishItem — GTIN (spec 012, seção 5)", () => {
  it("categoria sem GTIN: não envia EMPTY_GTIN_REASON", async () => {
    await publishItem(ACCESS_TOKEN, makeInput());
    const payload = apiMocks.createItem.mock.calls[0]![1] as { attributes: { id: string }[] };
    expect(payload.attributes.map((a) => a.id)).not.toContain("EMPTY_GTIN_REASON");
  });

  it("GTIN required: envia EMPTY_GTIN_REASON com o value_id da categoria (No registrado)", async () => {
    apiMocks.getCategoryAttributes.mockResolvedValue([
      ...CATEGORY_ATTRIBUTES,
      attr({ id: "GTIN", tags: { ...attr().tags, required: true } }),
      attr({
        id: "EMPTY_GTIN_REASON",
        values: [
          { id: "17055158", name: "Artesanal" },
          { id: "17055160", name: "No registrado" },
          { id: "17055161", name: "Otro" },
        ],
      }),
    ]);

    await publishItem(ACCESS_TOKEN, makeInput());

    const payload = apiMocks.createItem.mock.calls[0]![1] as { attributes: { id: string; value_id?: string }[] };
    const gtin = payload.attributes.find((a) => a.id === "EMPTY_GTIN_REASON");
    expect(gtin).toEqual({ id: "EMPTY_GTIN_REASON", value_id: "17055160", value_name: "No registrado" });
    expect(apiMocks.getConditionallyRequiredAttributes).not.toHaveBeenCalled();
  });

  it("GTIN conditional_required: consulta o endpoint condicional", async () => {
    apiMocks.getCategoryAttributes.mockResolvedValue([
      ...CATEGORY_ATTRIBUTES,
      attr({ id: "GTIN", tags: { ...attr().tags, conditionalRequired: true } }),
      attr({ id: "EMPTY_GTIN_REASON", values: [{ id: "17055160", name: "No registrado" }] }),
    ]);
    apiMocks.getConditionallyRequiredAttributes.mockResolvedValue(["GTIN"]);

    await publishItem(ACCESS_TOKEN, makeInput());

    const payload = apiMocks.createItem.mock.calls[0]![1] as { attributes: { id: string }[] };
    expect(payload.attributes.map((a) => a.id)).toContain("EMPTY_GTIN_REASON");
  });

  it("GTIN required mas sem EMPTY_GTIN_REASON disponível: erro claro", async () => {
    apiMocks.getCategoryAttributes.mockResolvedValue([
      ...CATEGORY_ATTRIBUTES,
      attr({ id: "GTIN", tags: { ...attr().tags, required: true } }),
    ]);

    await expect(publishItem(ACCESS_TOKEN, makeInput())).rejects.toThrow(/motivo de ausência de GTIN/);
  });
});

describe("publishItem — moda: tabela de medidas (spec 012, seção 3.5; ADR-024)", () => {
  it("domínio fora de active_domains: não busca tabela nenhuma", async () => {
    apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, catalogDomain: "MLB-SHORTS" });
    apiMocks.getActiveSizeChartDomains.mockResolvedValue([]);

    await publishItem(ACCESS_TOKEN, makeInput());

    expect(apiMocks.searchSizeCharts).not.toHaveBeenCalled();
  });

  it("categoria sem catalogDomain, mas com SIZE/GENDER na lista de atributos: envia os dois como atributos comuns (T043 — 'Cintos' exige SIZE/GENDER fora de active_domains)", async () => {
    apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, catalogDomain: undefined });
    apiMocks.getCategoryAttributes.mockResolvedValue([...CATEGORY_ATTRIBUTES]);

    await publishItem(ACCESS_TOKEN, makeInput());

    const payload = apiMocks.createItem.mock.calls[0]![1] as { attributes: { id: string; value_name?: string; value_id?: string }[] };
    const ids = payload.attributes.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["SIZE", "GENDER"]));
    expect(apiMocks.getActiveSizeChartDomains).not.toHaveBeenCalled();
  });

  it("sem tamanho_etiqueta nem tamanho_equivalente: erro antes do POST", async () => {
    apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, catalogDomain: "MLB-SHORTS" });
    apiMocks.getActiveSizeChartDomains.mockResolvedValue(["MLB-SHORTS"]);

    await expect(
      publishItem(
        ACCESS_TOKEN,
        makeInput({ product: makeProduct({ caracteristicas: { ...makeProduct().caracteristicas, tamanho_etiqueta: null, tamanho_equivalente: null } }) }),
      ),
    ).rejects.toThrow(/Informe o tamanho da peça/);
    expect(apiMocks.createItem).not.toHaveBeenCalled();
  });

  it("sem genero e departamento sem correspondência em GENDER: erro claro", async () => {
    apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, catalogDomain: "MLB-SHORTS" });
    apiMocks.getActiveSizeChartDomains.mockResolvedValue(["MLB-SHORTS"]);

    await expect(
      publishItem(ACCESS_TOKEN, makeInput({ product: makeProduct({ classificacao: { ...makeProduct().classificacao, departamento: "Unissex" } }) })),
    ).rejects.toThrow(/exige o gênero da peça/);
  });

  it("genero explícito sem correspondência na categoria (ex.: peça infantil numa categoria só adulta): erro claro", async () => {
    apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, catalogDomain: "MLB-SHORTS" });
    apiMocks.getActiveSizeChartDomains.mockResolvedValue(["MLB-SHORTS"]);

    await expect(
      publishItem(
        ACCESS_TOKEN,
        makeInput({
          product: makeProduct({
            classificacao: { ...makeProduct().classificacao, departamento: "Unissex" },
            caracteristicas: { ...makeProduct().caracteristicas, genero: "menino" },
          }),
        }),
      ),
    ).rejects.toThrow(/não aceita o gênero "menino"/);
  });

  describe("calçado (categoria SAPT)", () => {
    function sapProduct(overrides: Partial<Product> = {}): Product {
      return makeProduct({ classificacao: { ...makeProduct().classificacao, categoria_codigo: "SAPT" }, caracteristicas: { ...makeProduct().caracteristicas, tamanho_etiqueta: "38" }, ...overrides });
    }

    beforeEach(() => {
      apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, catalogDomain: "MLB-SNEAKERS" });
      apiMocks.getActiveSizeChartDomains.mockResolvedValue(["MLB-SNEAKERS"]);
    });

    it("normaliza o tamanho para 'N,0 BR' e busca STANDARD quando não há marca", async () => {
      apiMocks.searchSizeCharts.mockResolvedValue([{ id: "chart-std", type: "STANDARD", mainAttributeId: "SIZE" }]);
      apiMocks.getSizeChart.mockResolvedValue({ id: "chart-std", type: "STANDARD", rows: [{ id: "chart-std:1", attributes: [{ id: "SIZE", values: ["38,0 BR"] }] }] });

      await publishItem(ACCESS_TOKEN, makeInput({ product: sapProduct() }));

      expect(apiMocks.searchSizeCharts).toHaveBeenCalledWith(ACCESS_TOKEN, expect.objectContaining({ type: "STANDARD" }));
      const payload = apiMocks.createItem.mock.calls[0]![1] as { attributes: { id: string; value_name?: string }[] };
      expect(payload.attributes).toEqual(expect.arrayContaining([{ id: "SIZE", value_name: "38,0 BR" }]));
    });

    it("domain_id vai sem o prefixo do site na busca (confirmado ao vivo, T043)", async () => {
      apiMocks.searchSizeCharts.mockResolvedValue([{ id: "chart-std", type: "STANDARD", mainAttributeId: "SIZE" }]);
      apiMocks.getSizeChart.mockResolvedValue({ id: "chart-std", type: "STANDARD", rows: [{ id: "chart-std:1", attributes: [{ id: "SIZE", values: ["38,0 BR"] }] }] });

      await publishItem(ACCESS_TOKEN, makeInput({ product: sapProduct() }));

      expect(apiMocks.searchSizeCharts).toHaveBeenCalledWith(ACCESS_TOKEN, expect.objectContaining({ domainId: "SNEAKERS" }));
    });

    it("marca com tabela BRAND tem prioridade sobre STANDARD", async () => {
      apiMocks.searchSizeCharts.mockImplementation(async (_token: string, input: { type?: string }) =>
        input.type === "BRAND" ? [{ id: "chart-brand", type: "BRAND", mainAttributeId: "SIZE" }] : [],
      );
      apiMocks.getSizeChart.mockResolvedValue({ id: "chart-brand", type: "BRAND", rows: [{ id: "chart-brand:1", attributes: [{ id: "SIZE", values: ["38,0 BR"] }] }] });

      await publishItem(ACCESS_TOKEN, makeInput({ product: sapProduct({ marca: { nome: "Nike", original: true } }) }));

      const calls = apiMocks.searchSizeCharts.mock.calls.map((c) => (c[1] as { type?: string }).type);
      expect(calls[0]).toBe("BRAND");
    });

    it("sem tabela nenhuma: erro claro, sem publicar", async () => {
      apiMocks.searchSizeCharts.mockResolvedValue([]);
      await expect(publishItem(ACCESS_TOKEN, makeInput({ product: sapProduct() }))).rejects.toThrow(/Não há tabela de medidas/);
      expect(apiMocks.createItem).not.toHaveBeenCalled();
    });

    it("tabela existe mas sem o tamanho da peça: erro claro", async () => {
      apiMocks.searchSizeCharts.mockResolvedValue([{ id: "chart-std", type: "STANDARD", mainAttributeId: "SIZE" }]);
      apiMocks.getSizeChart.mockResolvedValue({ id: "chart-std", type: "STANDARD", rows: [{ id: "chart-std:1", attributes: [{ id: "SIZE", values: ["40,0 BR"] }] }] });

      await expect(publishItem(ACCESS_TOKEN, makeInput({ product: sapProduct() }))).rejects.toThrow(/não tem o tamanho/);
    });
  });

  describe("roupa — tabela SPECIFIC (ADR-024)", () => {
    function pantsProduct(overrides: Partial<Product> = {}): Product {
      return makeProduct(overrides);
    }

    beforeEach(() => {
      apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, catalogDomain: "MLB-SHORTS" });
      apiMocks.getActiveSizeChartDomains.mockResolvedValue(["MLB-SHORTS"]);
      apiMocks.getDomainSizeChartAttributes.mockResolvedValue([
        { id: "GARMENT_WAIST_WIDTH_FROM", name: "Cintura", valueType: "number_unit", tags: [] },
        { id: "GARMENT_HIP_WIDTH_FROM", name: "Quadril", valueType: "number_unit", tags: [] },
      ]);
    });

    it("medida exigida em branco: erro claro pedindo para completar o cadastro", async () => {
      await expect(
        publishItem(ACCESS_TOKEN, makeInput({ product: pantsProduct({ medidas: { ...makeProduct().medidas, cintura: null } }) })),
      ).rejects.toThrow(/Informe as medidas da peça/);
      expect(apiMocks.createItem).not.toHaveBeenCalled();
    });

    it("atributo não confirmado pela ADR-024 (parte de cima): erro claro, nunca adivinha", async () => {
      apiMocks.getDomainSizeChartAttributes.mockResolvedValue([{ id: "GARMENT_BUST_WIDTH_FROM", name: "Busto", valueType: "number_unit", tags: [] }]);

      await expect(publishItem(ACCESS_TOKEN, makeInput({ product: pantsProduct() }))).rejects.toThrow(
        /ainda não captura.*GARMENT_BUST_WIDTH_FROM/,
      );
    });

    it("sem tabela SPECIFIC existente: cria a tabela com a primeira linha", async () => {
      apiMocks.searchSizeCharts.mockResolvedValue([]);
      apiMocks.createSizeChart.mockResolvedValue({ id: "chart-new" });
      apiMocks.getSizeChart.mockResolvedValue({
        id: "chart-new",
        type: "SPECIFIC",
        rows: [{ id: "chart-new:1", attributes: [{ id: "SIZE", values: ["42"] }, { id: "GARMENT_WAIST_WIDTH_FROM", values: ["80 cm"] }, { id: "GARMENT_HIP_WIDTH_FROM", values: ["100 cm"] }] }],
      });

      await publishItem(ACCESS_TOKEN, makeInput({ product: pantsProduct() }));

      // domain_id vai SEM o prefixo do site pra POST /catalog/charts — diferente do resto da API
      // (settings.catalog_domain, active_domains etc. usam "MLB-SHORTS"); confirmado ao vivo no T043.
      expect(apiMocks.createSizeChart).toHaveBeenCalledWith(ACCESS_TOKEN, expect.objectContaining({ domainId: "SHORTS", measureType: "CLOTHING_MEASURE" }));
      const payload = apiMocks.createItem.mock.calls[0]![1] as { attributes: { id: string; value_name?: string }[] };
      expect(payload.attributes).toEqual(expect.arrayContaining([{ id: "SIZE_GRID_ID", value_name: "chart-new" }]));
    });

    it("tabela existe com linha idêntica: reaproveita, não adiciona linha nova", async () => {
      apiMocks.searchSizeCharts.mockResolvedValue([{ id: "chart-1", type: "SPECIFIC", mainAttributeId: "SIZE" }]);
      apiMocks.getSizeChart.mockResolvedValue({
        id: "chart-1",
        type: "SPECIFIC",
        rows: [{ id: "chart-1:1", attributes: [{ id: "SIZE", values: ["42"] }, { id: "GARMENT_WAIST_WIDTH_FROM", values: ["80 cm"] }, { id: "GARMENT_HIP_WIDTH_FROM", values: ["100 cm"] }] }],
      });

      await publishItem(ACCESS_TOKEN, makeInput({ product: pantsProduct() }));

      expect(apiMocks.createSizeChart).not.toHaveBeenCalled();
      expect(apiMocks.addSizeChartRow).not.toHaveBeenCalled();
      // domain_id vai sem o prefixo do site na busca SPECIFIC também (confirmado ao vivo, T043).
      expect(apiMocks.searchSizeCharts).toHaveBeenCalledWith(ACCESS_TOKEN, expect.objectContaining({ domainId: "SHORTS", type: "SPECIFIC" }));
    });

    it("tabela existe mas sem linha idêntica: adiciona uma linha nova", async () => {
      apiMocks.searchSizeCharts.mockResolvedValue([{ id: "chart-1", type: "SPECIFIC", mainAttributeId: "SIZE" }]);
      apiMocks.getSizeChart
        .mockResolvedValueOnce({
          id: "chart-1",
          type: "SPECIFIC",
          rows: [{ id: "chart-1:1", attributes: [{ id: "SIZE", values: ["44"] }, { id: "GARMENT_WAIST_WIDTH_FROM", values: ["90 cm"] }, { id: "GARMENT_HIP_WIDTH_FROM", values: ["110 cm"] }] }],
        })
        .mockResolvedValueOnce({
          id: "chart-1",
          type: "SPECIFIC",
          rows: [
            { id: "chart-1:1", attributes: [{ id: "SIZE", values: ["44"] }, { id: "GARMENT_WAIST_WIDTH_FROM", values: ["90 cm"] }, { id: "GARMENT_HIP_WIDTH_FROM", values: ["110 cm"] }] },
            { id: "chart-1:2", attributes: [{ id: "SIZE", values: ["42"] }, { id: "GARMENT_WAIST_WIDTH_FROM", values: ["80 cm"] }, { id: "GARMENT_HIP_WIDTH_FROM", values: ["100 cm"] }] },
          ],
        });

      await publishItem(ACCESS_TOKEN, makeInput({ product: pantsProduct() }));

      expect(apiMocks.addSizeChartRow).toHaveBeenCalledWith(ACCESS_TOKEN, "chart-1", expect.anything());
    });
  });
});

describe("publishItem — erro de rede genérico não é mascarado (propaga para callWithFreshToken tratar)", () => {
  it("MercadoLivreApiError de createItem propaga sem modificação de tipo", async () => {
    apiMocks.createItem.mockRejectedValue(new MercadoLivreApiError("Categoria bloqueada.", 400, "moderations.seller.not_authorized"));
    await expect(publishItem(ACCESS_TOKEN, makeInput())).rejects.toThrow(MercadoLivreApiError);
  });

  it("nunca inclui token nem client_secret nas mensagens de erro produzidas aqui", async () => {
    apiMocks.getCategory.mockResolvedValue({ ...CATEGORY_SETTINGS, listingAllowed: false });
    const error = await publishItem(ACCESS_TOKEN, makeInput()).catch((e: Error) => e);
    expect((error as Error).message).not.toContain(ACCESS_TOKEN);
  });
});
