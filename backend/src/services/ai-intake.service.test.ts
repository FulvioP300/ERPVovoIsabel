import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "../repositories/category.repository.js";
import type { AiProviderPort } from "../plugins/ai/ai-provider.port.js";

const listMock = vi.fn();

vi.mock("../repositories/category.repository.js", () => ({
  categoryRepository: {
    list: (...args: unknown[]) => listMock(...args),
  },
}));

vi.mock("../database/mongo.client.js", () => ({
  getDb: () => ({}),
}));

const { analyzeProduct, setAiProviderForTesting, InvalidAiResponseError, NoImagesProvidedError, TooManyImagesError } =
  await import("./ai-intake.service.js");
const { InvalidImageTypeError } = await import("./image.service.js");
const { MAX_PRODUCT_IMAGES } = await import("../../../shared/dist/schemas/product.schema.js");

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-1",
    code: "BERM",
    name: "Bermudas",
    department: "Masculino",
    active: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function fakeImage() {
  return { buffer: Buffer.from("fake-image-bytes"), mimeType: "image/jpeg" };
}

function fakeProvider(response: unknown): AiProviderPort {
  return { analyze: vi.fn().mockResolvedValue(response) };
}

function baseSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    identificacao: { nome: "Bermuda Jeans", descricao: null },
    classificacao: { categoria_codigo: "BERM", subcategoria: null, estilo: [], ocasiao: [], estacao: [] },
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
    medidas: { unidade: "cm", cintura: null, quadril: null, gancho: null, comprimento: null, largura_barra: null, coxa: null, entrepasso: null },
    condicao: {
      estado: "novo",
      nota: null,
      possui_etiqueta: null,
      possui_defeitos: null,
      defeitos: [],
      observacoes: null,
    },
    ...overrides,
  };
}

describe("ai-intake.service.analyzeProduct", () => {
  beforeEach(() => {
    listMock.mockReset();
    listMock.mockResolvedValue([makeCategory()]);
  });

  it("rejeita quando nenhuma imagem é enviada", async () => {
    await expect(analyzeProduct({ prompt: "bermuda", images: [] })).rejects.toBeInstanceOf(NoImagesProvidedError);
  });

  it(`rejeita mais de ${MAX_PRODUCT_IMAGES} imagens`, async () => {
    const images = Array.from({ length: MAX_PRODUCT_IMAGES + 1 }, fakeImage);
    await expect(analyzeProduct({ prompt: "bermuda", images })).rejects.toBeInstanceOf(TooManyImagesError);
  });

  it("rejeita imagem com MIME type inválido antes de chamar o provedor", async () => {
    const provider = fakeProvider(baseSuggestion());
    setAiProviderForTesting(provider);

    await expect(
      analyzeProduct({ prompt: "bermuda", images: [{ buffer: Buffer.from("x"), mimeType: "application/pdf" }] }),
    ).rejects.toBeInstanceOf(InvalidImageTypeError);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it("propaga null quando o adapter não determina um atributo (marca) — nunca inventa", async () => {
    setAiProviderForTesting(fakeProvider(baseSuggestion()));
    const result = await analyzeProduct({ prompt: "bermuda azul", images: [fakeImage()] });
    expect(result.marca.nome).toBeNull();
  });

  it("rejeita payload com campo obrigatório ausente (Zod)", async () => {
    setAiProviderForTesting(fakeProvider({ identificacao: { nome: "x", descricao: null } }));
    await expect(analyzeProduct({ prompt: "bermuda", images: [fakeImage()] })).rejects.toBeInstanceOf(
      InvalidAiResponseError,
    );
  });

  it("segurança: JSON com sku/preco/status extra é rejeitado pelo .strict() — nunca ignorado em silêncio (spec 8.4)", async () => {
    setAiProviderForTesting(
      fakeProvider({ ...baseSuggestion(), sku: "BVI-BERM-000001", preco: { preco_venda: 1 }, status: "disponivel" }),
    );
    await expect(analyzeProduct({ prompt: "bermuda", images: [fakeImage()] })).rejects.toBeInstanceOf(
      InvalidAiResponseError,
    );
  });

  it("segurança: categoria_codigo fora da taxonomia ativa vira null — defesa independe do prompt (spec 8.2-D)", async () => {
    setAiProviderForTesting(
      fakeProvider(
        baseSuggestion({
          classificacao: { categoria_codigo: "INVENTADA", subcategoria: null, estilo: [], ocasiao: [], estacao: [] },
        }),
      ),
    );
    const result = await analyzeProduct({ prompt: "bermuda", images: [fakeImage()] });
    expect(result.classificacao.categoria_codigo).toBeNull();
  });

  it("aceita categoria_codigo quando corresponde a uma categoria ativa", async () => {
    setAiProviderForTesting(fakeProvider(baseSuggestion()));
    const result = await analyzeProduct({ prompt: "bermuda", images: [fakeImage()] });
    expect(result.classificacao.categoria_codigo).toBe("BERM");
  });
});
