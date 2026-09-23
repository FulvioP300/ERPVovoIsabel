import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MercadoLivreApiError,
  addSizeChartRow,
  closeItem,
  createDescription,
  createItem,
  createSizeChart,
  getActiveSizeChartDomains,
  getCategory,
  getCategoryAttributes,
  getConditionallyRequiredAttributes,
  getDomainSizeChartAttributes,
  getItem,
  getItemsByIds,
  getSizeChart,
  predictCategory,
  searchItemsBySellerSku,
  searchSizeCharts,
  updateDescription,
  updateItem,
} from "./mercado-livre-api.client.js";

const TOKEN = "APP_USR-abc";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetchSequence(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubFetch(status: number, body: unknown) {
  return stubFetchSequence(jsonResponse(status, body));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("erros e mensagens (spec 011, seção 3; spec 012, seção 3.6)", () => {
  it("erro de validação: mensagem vem das causas type=error; warning não entra na mensagem", async () => {
    stubFetch(400, {
      message: "Validation error",
      error: "validation_error",
      status: 400,
      cause: [
        { department: "structured-data", cause_id: 1, type: "warning", code: "w1", message: "Aviso ignorável" },
        { department: "supply", cause_id: 7810, type: "error", code: "item.attribute.missing_conditional_required", message: "GTIN obrigatório" },
      ],
    });

    const error = await createItem(TOKEN, { title: "x" }).then(
      () => new Error("deveria ter falhado"),
      (err: Error) => err,
    );

    expect(error).toBeInstanceOf(MercadoLivreApiError);
    expect(error.message).toBe("GTIN obrigatório");
    expect(error.message).not.toContain("Aviso ignorável");
    expect((error as MercadoLivreApiError).hasCauseCode("item.attribute.missing_conditional_required")).toBe(true);
  });

  it("erro sem cause[]: usa a mensagem de nível superior", async () => {
    stubFetch(500, { message: "Internal error" });
    await expect(createItem(TOKEN, {})).rejects.toThrow("Internal error");
  });

  it("cause presente mas não é array: não quebra, cai na mensagem de nível superior (T043 — item removido devolveu um formato diferente)", async () => {
    stubFetch(404, { message: "Item not found", error: "not_found", status: 404, cause: { unexpected: "shape" } });
    const error = await createItem(TOKEN, {}).then(
      () => new Error("deveria ter falhado"),
      (err: Error) => err,
    );
    expect(error).toBeInstanceOf(MercadoLivreApiError);
    expect(error.message).toBe("Item not found");
  });

  it("formato alternativo `errors` (sem type — visto em /catalog/charts, T043): toda entrada é bloqueante", async () => {
    stubFetch(400, {
      error: "chart_validation_error",
      message: "Chart validation errors found",
      status: 400,
      errors: [{ code: "required_row_attribute_not_found", message: "Required attribute X was not found in row." }],
    });
    const error = await createItem(TOKEN, {}).then(
      () => new Error("deveria ter falhado"),
      (err: Error) => err,
    );
    expect(error.message).toBe("Required attribute X was not found in row.");
    expect((error as MercadoLivreApiError).hasCauseCode("required_row_attribute_not_found")).toBe(true);
  });

  it("falha de rede vira mensagem clara, sem detalhes técnicos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(getItem(TOKEN, "MLB1")).rejects.toThrow(/Não foi possível falar com o Mercado Livre/);
  });

  it("nunca inclui o token de acesso na mensagem de erro", async () => {
    stubFetch(400, { message: "erro qualquer" });
    const error = await createItem(TOKEN, {}).then(
      () => new Error("deveria ter falhado"),
      (err: Error) => err,
    );
    expect(error.message).not.toContain(TOKEN);
  });
});

describe("cabeçalhos e base URL", () => {
  it("sempre envia Authorization: Bearer e Accept: application/json", async () => {
    const fetchMock = stubFetch(200, { id: "MLB1", status: "active" });
    await getItem(TOKEN, "MLB1");

    const [, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.accept).toBe("application/json");
  });

  it("POST/PUT com corpo envia Content-Type: application/json", async () => {
    const fetchMock = stubFetch(201, { id: "MLB1", permalink: "https://x", status: "active" });
    await createItem(TOKEN, { title: "Peça" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadolibre.com/items");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Peça" });
  });

  it("MERCADO_LIVRE_API_BASE_URL só vale fora de produção", async () => {
    const original = { base: process.env.MERCADO_LIVRE_API_BASE_URL, env: process.env.NODE_ENV };
    try {
      process.env.MERCADO_LIVRE_API_BASE_URL = "https://fake.local";
      process.env.NODE_ENV = "test";
      let fetchMock = stubFetch(200, { id: "1", status: "active" });
      await getItem(TOKEN, "1");
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe("https://fake.local/items/1");

      process.env.NODE_ENV = "production";
      fetchMock = stubFetch(200, { id: "1", status: "active" });
      await getItem(TOKEN, "1");
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe("https://api.mercadolibre.com/items/1");
    } finally {
      if (original.base === undefined) delete process.env.MERCADO_LIVRE_API_BASE_URL;
      else process.env.MERCADO_LIVRE_API_BASE_URL = original.base;
      process.env.NODE_ENV = original.env;
    }
  });
});

describe("predictCategory (spec 012, seção 4)", () => {
  it("GET .../domain_discovery/search?limit=1&q=… e devolve o primeiro resultado", async () => {
    const fetchMock = stubFetch(200, [
      { domain_id: "MLB-SHORTS", domain_name: "Shorts", category_id: "MLB188064", category_name: "Bermudas", attributes: [{ id: "BRAND", value_name: "Nike" }] },
    ]);

    const result = await predictCategory(TOKEN, "bermuda masculina");

    expect(result).toEqual({
      domainId: "MLB-SHORTS",
      domainName: "Shorts",
      categoryId: "MLB188064",
      categoryName: "Bermudas",
      attributes: [{ id: "BRAND", valueId: undefined, valueName: "Nike" }],
    });
    const url = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/sites/MLB/domain_discovery/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: "1", q: "bermuda masculina" });
  });

  it("sem resultado: null, sem lançar", async () => {
    stubFetch(200, []);
    await expect(predictCategory(TOKEN, "algo sem categoria")).resolves.toBeNull();
  });
});

describe("getCategory / getCategoryAttributes (spec 012, seção 4)", () => {
  it("lê os campos de settings usados pela publicação", async () => {
    stubFetch(200, {
      settings: {
        max_title_length: 60,
        minimum_price: 10,
        maximum_price: null,
        max_pictures_per_item: 12,
        max_description_length: 50000,
        immediate_payment: "optional",
        listing_allowed: true,
        status: "enabled",
        catalog_domain: "MLB-SHIRTS",
      },
    });

    await expect(getCategory(TOKEN, "MLB188064")).resolves.toEqual({
      maxTitleLength: 60,
      minimumPrice: 10,
      maximumPrice: null,
      maxPicturesPerItem: 12,
      maxDescriptionLength: 50000,
      immediatePayment: "optional",
      listingAllowed: true,
      status: "enabled",
      catalogDomain: "MLB-SHIRTS",
    });
  });

  it("listing_allowed ausente não vira false por engano (só false explícito bloqueia)", async () => {
    stubFetch(200, { settings: {} });
    await expect(getCategory(TOKEN, "MLB1")).resolves.toMatchObject({ listingAllowed: true });

    stubFetch(200, { settings: { listing_allowed: false } });
    await expect(getCategory(TOKEN, "MLB1")).resolves.toMatchObject({ listingAllowed: false });
  });

  it("catalog_domain ausente vira undefined, nunca inventado", async () => {
    stubFetch(200, { settings: {} });
    await expect(getCategory(TOKEN, "MLB1")).resolves.toMatchObject({ catalogDomain: undefined });
  });

  it("traduz as tags em booleanos, mesmo quando ausentes", async () => {
    stubFetch(200, [
      { id: "GTIN", name: "GTIN", value_type: "string", tags: { conditional_required: true } },
      { id: "BRAND", name: "Marca", value_type: "string", tags: {}, values: [{ id: "1", name: "Nike" }] },
    ]);

    const attributes = await getCategoryAttributes(TOKEN, "MLB188064");

    expect(attributes[0]).toMatchObject({ id: "GTIN", tags: { conditionalRequired: true, required: false } });
    expect(attributes[1]).toMatchObject({ id: "BRAND", values: [{ id: "1", name: "Nike" }] });
  });

  it("getConditionallyRequiredAttributes: POST com o item e devolve os ids exigidos", async () => {
    const fetchMock = stubFetch(200, { required_attributes: [{ id: "GTIN", name: "Código universal" }] });

    const required = await getConditionallyRequiredAttributes(TOKEN, "MLB188064", { title: "x", price: 10 });

    expect(required).toEqual(["GTIN"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadolibre.com/categories/MLB188064/attributes/conditional");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "x", price: 10 });
  });

  it("required_attributes vazio (dentro das exceções): array vazio", async () => {
    stubFetch(200, { required_attributes: [] });
    await expect(getConditionallyRequiredAttributes(TOKEN, "MLB1", {})).resolves.toEqual([]);
  });
});

describe("criar/atualizar item e descrição", () => {
  it("createItem devolve id/permalink/status/warnings", async () => {
    stubFetch(201, { id: "MLB123", permalink: "https://produto.mercadolivre.com.br/MLB-123", status: "active", warnings: [] });
    await expect(createItem(TOKEN, { title: "x" })).resolves.toEqual({
      id: "MLB123",
      permalink: "https://produto.mercadolivre.com.br/MLB-123",
      status: "active",
      warnings: [],
    });
  });

  it("updateItem: PUT /items/{id}", async () => {
    const fetchMock = stubFetch(200, { id: "MLB123", status: "active" });
    await updateItem(TOKEN, "MLB123", { price: 100 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadolibre.com/items/MLB123");
    expect(init.method).toBe("PUT");
  });

  it("warnings de sucesso são lidos de forma defensiva (entrada sem code, sem quebrar)", async () => {
    stubFetch(200, { id: "MLB1", status: "active", warnings: [{ message: "Preço não atualizado" }, {}] });
    const result = await createItem(TOKEN, {});
    expect(result.warnings).toEqual([
      { code: undefined, message: "Preço não atualizado" },
      { code: undefined, message: "Aviso não detalhado do Mercado Livre." },
    ]);
  });

  it("createDescription: POST /items/{id}/description com plain_text", async () => {
    const fetchMock = stubFetch(201, {});
    await createDescription(TOKEN, "MLB1", "Descrição da peça");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadolibre.com/items/MLB1/description");
    expect(JSON.parse(init.body as string)).toEqual({ plain_text: "Descrição da peça" });
  });

  it("updateDescription: PUT .../description?api_version=2", async () => {
    const fetchMock = stubFetch(200, {});
    await updateDescription(TOKEN, "MLB1", "Nova descrição");

    const url = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/items/MLB1/description");
    expect(url.searchParams.get("api_version")).toBe("2");
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe("PUT");
  });
});

describe("getItemsByIds (multiget, spec 012, seção 3.1)", () => {
  it("mapeia só as entradas com code=200, ignora as demais sem lançar", async () => {
    stubFetch(200, [
      { code: 200, body: { id: "MLB1", status: "active", sold_quantity: 0, category_id: "MLB1" } },
      { code: 404, body: { error: "not_found" } },
    ]);

    const items = await getItemsByIds(TOKEN, ["MLB1", "MLB2"]);

    expect(items).toEqual([{ id: "MLB1", status: "active", soldQuantity: 0, categoryId: "MLB1", permalink: undefined }]);
  });

  it("lista vazia não chama a rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getItemsByIds(TOKEN, [])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchItemsBySellerSku (spec 012, seção 3.1)", () => {
  it("GET /users/{sellerId}/items/search?seller_sku=…&orders=start_time_desc", async () => {
    const fetchMock = stubFetch(200, { paging: { total: 2 }, results: ["MLB2", "MLB1"] });

    const ids = await searchItemsBySellerSku(TOKEN, "987654", "BVI-BERM-000001");

    expect(ids).toEqual(["MLB2", "MLB1"]);
    const url = new URL((fetchMock.mock.calls[0] as [string])[0]);
    expect(url.pathname).toBe("/users/987654/items/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ seller_sku: "BVI-BERM-000001", orders: "start_time_desc" });
  });
});

describe("closeItem (spec 012, seção 7)", () => {
  it("já encerrado: sucesso sem PUT", async () => {
    const fetchMock = stubFetch(200, { id: "MLB1", status: "closed" });

    await expect(closeItem(TOKEN, "MLB1")).resolves.toEqual({ alreadyClosed: true });
    expect(fetchMock).toHaveBeenCalledTimes(1); // só o GET
  });

  it("ativo: GET + PUT status=closed", async () => {
    const fetchMock = stubFetchSequence(jsonResponse(200, { id: "MLB1", status: "active" }), jsonResponse(200, { id: "MLB1", status: "closed" }));

    await expect(closeItem(TOKEN, "MLB1")).resolves.toEqual({ alreadyClosed: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ status: "closed" });
  });

  it("409 de versão: repete até 3 tentativas e então sucede", async () => {
    const fetchMock = stubFetchSequence(
      jsonResponse(200, { id: "MLB1", status: "active" }),
      jsonResponse(409, { message: "item optimistic locking error: conflict", cause: [] }),
      jsonResponse(409, { message: "item optimistic locking error: conflict", cause: [] }),
      jsonResponse(200, { id: "MLB1", status: "closed" }),
    );

    const promise = closeItem(TOKEN, "MLB1");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ alreadyClosed: false });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("409 esgotando as tentativas: falha com o erro do Mercado Livre", async () => {
    const fetchMock = stubFetchSequence(
      jsonResponse(200, { id: "MLB1", status: "active" }),
      jsonResponse(409, { message: "conflito 1", cause: [] }),
      jsonResponse(409, { message: "conflito 2", cause: [] }),
      jsonResponse(409, { message: "conflito 3", cause: [] }),
    );

    const promise = closeItem(TOKEN, "MLB1");
    promise.catch(() => undefined);
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("conflito 3");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("erro diferente de 409 (ex.: item bloqueado) não é repetido", async () => {
    const fetchMock = stubFetchSequence(
      jsonResponse(200, { id: "MLB1", status: "under_review" }),
      jsonResponse(403, { message: "Item moderado, não pode ser encerrado." }),
    );

    await expect(closeItem(TOKEN, "MLB1")).rejects.toThrow("Item moderado, não pode ser encerrado.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("tabela de medidas (spec 012, seção 3.5; ADR-024)", () => {
  it("getActiveSizeChartDomains: 404 (config_not_found) vira lista vazia, não erro", async () => {
    stubFetch(404, { error: "config_not_found", message: "Config not found", status: 404 });
    await expect(getActiveSizeChartDomains(TOKEN)).resolves.toEqual([]);
  });

  it("getActiveSizeChartDomains: lista os domain_id", async () => {
    stubFetch(200, { domains: [{ domain_id: "MLB-SNEAKERS" }, { domain_id: "MLB-SHORTS" }] });
    await expect(getActiveSizeChartDomains(TOKEN)).resolves.toEqual(["MLB-SNEAKERS", "MLB-SHORTS"]);
  });

  it("getDomainSizeChartAttributes: extrai os atributos — dois níveis de components (confirmado ao vivo, T043)", async () => {
    // Formato real: input.groups[].components[].components[].attributes[] — o nível de fora é a
    // seção (ex. "GRID"), o de dentro é cada campo (BRAND, GENDER...). Um parser de um nível só
    // (o original, antes do T043) nunca encontrava nada.
    stubFetch(200, {
      input: {
        groups: [
          {
            components: [
              {
                component: "GRID",
                components: [
                  { attributes: [{ id: "GENDER", name: "Gênero", value_type: "string", tags: ["grid_template_required", "required"] }] },
                  { attributes: [{ id: "BRAND", name: "Marca", value_type: "string", tags: ["grid_filter", "required"] }] },
                  {},
                ],
              },
            ],
          },
        ],
      },
    });

    const attributes = await getDomainSizeChartAttributes(TOKEN, "MLB-SHORTS", { valueId: "339665", valueName: "Feminino" });

    expect(attributes).toEqual([
      { id: "GENDER", name: "Gênero", valueType: "string", tags: ["grid_template_required", "required"] },
      { id: "BRAND", name: "Marca", valueType: "string", tags: ["grid_filter", "required"] },
    ]);
  });

  it("getDomainSizeChartAttributes: sem components internos (ou seção vazia) devolve lista vazia, não erro", async () => {
    stubFetch(200, { input: { groups: [{ components: [{ component: "GRID" }] }] } });
    await expect(
      getDomainSizeChartAttributes(TOKEN, "MLB-SHORTS", { valueId: "339665", valueName: "Feminino" }),
    ).resolves.toEqual([]);
  });

  it("getDomainSizeChartAttributes: POST (não GET) com section=grids na query e o GENDER resolvido no corpo (T060 — sem isso a ficha técnica não traz GARMENT_*)", async () => {
    const fetchMock = stubFetch(200, { input: { groups: [] } });
    await getDomainSizeChartAttributes(TOKEN, "MLB-SHORTS", { valueId: "339665", valueName: "Feminino" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(new URL(url).searchParams.get("section")).toBe("grids");
    expect(JSON.parse(init.body as string)).toEqual({
      attributes: [
        {
          id: "GENDER",
          name: "Gênero",
          value_id: "339665",
          value_name: "Feminino",
          values: [{ id: "339665", name: "Feminino" }],
        },
      ],
    });
  });

  it("searchSizeCharts: POST com domain/site/seller/type/attributes e offset+limit na query", async () => {
    const fetchMock = stubFetch(200, { charts: [{ id: "210059", type: "STANDARD", main_attribute_id: "BR_SIZE" }] });

    const charts = await searchSizeCharts(TOKEN, {
      domainId: "SNEAKERS",
      sellerId: "987654",
      type: "STANDARD",
      attributes: [{ id: "GENDER", values: ["Feminino"] }],
    });

    expect(charts).toEqual([{ id: "210059", type: "STANDARD", mainAttributeId: "BR_SIZE" }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsedUrl = new URL(url);
    expect(parsedUrl.pathname).toBe("/catalog/charts/search");
    expect(Object.fromEntries(parsedUrl.searchParams)).toEqual({ offset: "0", limit: "100" });
    expect(JSON.parse(init.body as string)).toEqual({
      domain_id: "SNEAKERS",
      site_id: "MLB",
      seller_id: "987654",
      type: "STANDARD",
      attributes: [{ id: "GENDER", values: [{ name: "Feminino" }] }],
    });
  });

  it("getSizeChart: devolve as linhas com seus atributos", async () => {
    stubFetch(200, {
      id: "232382",
      type: "SPECIFIC",
      rows: [{ id: "232382:1", attributes: [{ id: "SIZE", values: [{ name: "38" }] }] }],
    });

    await expect(getSizeChart(TOKEN, "232382")).resolves.toEqual({
      id: "232382",
      type: "SPECIFIC",
      rows: [{ id: "232382:1", attributes: [{ id: "SIZE", values: ["38"] }] }],
    });
  });

  it("createSizeChart: monta names/domain/measure_type/attributes/main_attribute/rows", async () => {
    const fetchMock = stubFetch(201, { id: "999" });

    const result = await createSizeChart(TOKEN, {
      name: "Tabela Vovó Isabel — Calças Feminino",
      domainId: "PANTS",
      measureType: "CLOTHING_MEASURE",
      attributes: [{ id: "GENDER", values: ["Feminino"] }],
      mainAttributeId: "SIZE",
      firstRow: {
        attributes: [
          { id: "SIZE", values: ["38"] },
          { id: "GARMENT_WAIST_WIDTH_FROM", values: ["30 cm"] },
        ],
      },
    });

    expect(result).toEqual({ id: "999" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadolibre.com/catalog/charts");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      names: { MLB: "Tabela Vovó Isabel — Calças Feminino" },
      domain_id: "PANTS",
      site_id: "MLB",
      measure_type: "CLOTHING_MEASURE",
      main_attribute: { attributes: [{ site_id: "MLB", id: "SIZE" }] },
    });
    expect(body.rows).toEqual([
      {
        attributes: [
          { id: "SIZE", values: [{ name: "38" }] },
          { id: "GARMENT_WAIST_WIDTH_FROM", values: [{ name: "30 cm" }] },
        ],
      },
    ]);
  });

  it("addSizeChartRow: POST /catalog/charts/{id}/rows com os atributos da linha", async () => {
    const fetchMock = stubFetch(201, {});

    await addSizeChartRow(TOKEN, "999", { attributes: [{ id: "SIZE", values: ["40"] }] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadolibre.com/catalog/charts/999/rows");
    expect(JSON.parse(init.body as string)).toEqual({ attributes: [{ id: "SIZE", values: [{ name: "40" }] }] });
  });
});
