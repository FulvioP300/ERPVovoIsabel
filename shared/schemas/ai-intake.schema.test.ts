import { describe, expect, it } from "vitest";
import { AiSuggestedProductSchema } from "./ai-intake.schema.js";

function baseSuggestion() {
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
  };
}

describe("AiSuggestedProductSchema", () => {
  it("aceita uma sugestão válida, com ai_metadata default quando omitido", () => {
    const parsed = AiSuggestedProductSchema.parse(baseSuggestion());
    expect(parsed.ai_metadata).toEqual({ fields: {} });
  });

  it("rejeita campos fora do contrato (sku/preco/status) — .strict(), nunca descarta em silêncio", () => {
    const withInjection = { ...baseSuggestion(), sku: "BVI-BERM-000001", preco: { preco_venda: 1 }, status: "disponivel" };
    expect(AiSuggestedProductSchema.safeParse(withInjection).success).toBe(false);
  });

  it("campos não determináveis chegam como null, nunca omitidos", () => {
    const parsed = AiSuggestedProductSchema.parse(baseSuggestion());
    expect(parsed.marca.nome).toBeNull();
    expect(parsed.condicao.possui_defeitos).toBeNull();
  });

  it("rejeita quando uma subseção obrigatória está ausente", () => {
    const { marca: _marca, ...withoutMarca } = baseSuggestion();
    expect(AiSuggestedProductSchema.safeParse(withoutMarca).success).toBe(false);
  });
});
