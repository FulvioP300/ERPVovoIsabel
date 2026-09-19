import { z } from "zod";

/**
 * Modelo canônico de produto (specs/005-produtos-cadastro-manual/spec.md, seção 2) — fonte
 * única de verdade, reaproveitada por backend, frontend e 006-produtos-cadastro-ia (subset
 * retornado pela IA). Campos de atributo (marca, características, medidas etc.) são
 * nullable: no cadastro manual o operador pode deixar em branco; no cadastro por IA, `null`
 * é o valor obrigatório quando o dado não pôde ser determinado (constituição, princípio I —
 * nunca um valor inventado).
 */

export const ProductStatusEnum = z.enum([
  "rascunho",
  "em_revisao",
  "disponivel",
  "reservado",
  "vendido",
  "inativo",
]);
export type ProductStatus = z.infer<typeof ProductStatusEnum>;

/**
 * A spec não enumera os valores possíveis de `condicao.estado` (só mostra o exemplo "novo")
 * — conjunto fechado definido na implementação, seguindo o vocabulário comum de brechó.
 * Necessário ser um enum fechado (não texto livre) porque a spec lista "estado da peça" como
 * filtro da tela de produtos (seção 5).
 */
export const CondicaoEstadoEnum = z.enum(["novo", "seminovo", "usado"]);
export type CondicaoEstado = z.infer<typeof CondicaoEstadoEnum>;

export const MedidasUnidadeEnum = z.enum(["cm", "in"]);
export const MoedaEnum = z.enum(["BRL", "USD", "EUR"]);
export const CanalVendaEnum = z.enum(["loja_fisica", "ecommerce", "mercado_livre", "shopee", "outro"]);

const nullableString = () => z.string().nullable();
const nullableNumber = () => z.number().nullable();
const stringArray = () => z.array(z.string()).default([]);

export const IdentificacaoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório."),
  descricao: nullableString().default(null),
  peca_unica: z.boolean().default(true),
  quantidade: z.number().int().min(1).default(1),
  data_cadastro: z.coerce.date(),
});

export const ClassificacaoSchema = z.object({
  categoria_codigo: z.string().min(1, "Categoria é obrigatória."),
  categoria: z.string(),
  subcategoria: nullableString().default(null),
  departamento: z.string(),
  estilo: stringArray(),
  ocasiao: stringArray(),
  estacao: stringArray(),
});

export const MarcaSchema = z.object({
  nome: nullableString().default(null),
  original: z.boolean().nullable().default(null),
});

export const CaracteristicasSchema = z.object({
  tamanho_etiqueta: nullableString().default(null),
  tamanho_equivalente: nullableString().default(null),
  cor_principal: nullableString().default(null),
  cores_secundarias: stringArray(),
  estampa: nullableString().default(null),
  material: stringArray(),
  composicao: nullableString().default(null),
  lavagem: nullableString().default(null),
  modelagem: nullableString().default(null),
  elasticidade: nullableString().default(null),
  fechamento: stringArray(),
});

export const MedidasSchema = z.object({
  unidade: MedidasUnidadeEnum.default("cm"),
  cintura: nullableNumber().default(null),
  quadril: nullableNumber().default(null),
  gancho: nullableNumber().default(null),
  comprimento: nullableNumber().default(null),
  largura_barra: nullableNumber().default(null),
});

/** Sempre em kg (spec, seção 19) — unidade fixa, ao contrário de `medidas` (cm/in), então um
 * literal em vez de enum: não existe seletor de unidade na UI. */
export const PesoSchema = z.object({
  valor: nullableNumber().default(null),
  unidade: z.literal("kg").default("kg"),
});
const DEFAULT_PESO = { valor: null, unidade: "kg" as const };

/**
 * Objeto base sem o `.superRefine` — exportado separadamente para que consumidores (ex.:
 * `UpdateProductSchema` no backend) possam derivar uma versão `.partial()` dela; `ZodEffects`
 * (o que `.superRefine` retorna) não tem `.partial()`.
 */
export const CondicaoBaseSchema = z.object({
  estado: CondicaoEstadoEnum,
  nota: z.number().min(0).max(10).nullable().default(null),
  possui_etiqueta: z.boolean().default(false),
  possui_defeitos: z.boolean().default(false),
  defeitos: stringArray(),
  observacoes: nullableString().default(null),
});

export const CondicaoSchema = CondicaoBaseSchema
  // Regra condicional central da spec (seção "possui_defeitos"): nunca aceitar
  // possui_defeitos=true sem ao menos um defeito descrito.
  .superRefine((data, ctx) => {
    if (data.possui_defeitos && data.defeitos.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defeitos"],
        message: "Descreva ao menos um defeito quando possui_defeitos for true.",
      });
    }
  });

export const PrecoSchema = z.object({
  preco_original_estimado: nullableNumber().default(null),
  custo_aquisicao: nullableNumber().default(null),
  preco_venda: nullableNumber().default(null),
  preco_promocional: nullableNumber().default(null),
  moeda: MoedaEnum.default("BRL"),
});

export const LocalizacaoEstoqueSchema = z.object({
  loja: z.string().default("Loja Principal"),
  setor: nullableString().default(null),
  arara: nullableString().default(null),
  posicao: nullableString().default(null),
});

export const EstoqueSchema = z.object({
  quantidade: z.number().int().min(0).default(1),
  localizacao: LocalizacaoEstoqueSchema.default({
    loja: "Loja Principal",
    setor: null,
    arara: null,
    posicao: null,
  }),
});

export const ImagemSchema = z.object({
  id: z.string(),
  url: z.string(),
  ordem: z.number().int().min(0).default(0),
  tipo: z.string().nullable().default(null),
});

/** Nº máximo de fotos por peça (005/007) — limite aplicado aqui, fonte única para as duas specs. */
export const MAX_PRODUCT_IMAGES = 10;

export const ImagensSchema = z.object({
  principal: ImagemSchema.nullable().default(null),
  galeria: z.array(ImagemSchema).max(MAX_PRODUCT_IMAGES, `No máximo ${MAX_PRODUCT_IMAGES} fotos por peça.`).default([]),
});

export const EcommerceSchema = z.object({
  publicado: z.boolean().default(false),
  slug: nullableString().default(null),
  titulo_seo: nullableString().default(null),
  tags: stringArray(),
});

/** Existe no schema para compatibilidade futura — sem funcionalidade ativa no MVP (spec, seção 8). */
export const MarketplaceStatusSchema = z.object({
  publicado: z.boolean().default(false),
  id_anuncio: nullableString().default(null),
});

export const MarketplacesSchema = z.object({
  mercado_livre: MarketplaceStatusSchema.default({ publicado: false, id_anuncio: null }),
  shopee: MarketplaceStatusSchema.default({ publicado: false, id_anuncio: null }),
});

export const VendaSchema = z.object({
  vendido: z.boolean().default(false),
  data_venda: z.coerce.date().nullable().default(null),
  canal_venda: CanalVendaEnum.nullable().default(null),
  valor_venda: nullableNumber().default(null),
});

/** Campo por atributo com a confiança que a IA atribuiu — ver 006-produtos-cadastro-ia. */
export const AiFieldConfidenceSchema = z.object({
  confidence: z.number().min(0).max(1),
  source: z.string(),
});

export const AiMetadataSchema = z.object({
  generated: z.boolean().default(false),
  model: nullableString().default(null),
  generated_at: z.coerce.date().nullable().default(null),
  fields: z.record(AiFieldConfidenceSchema).default({}),
});

export const AuditoriaSchema = z.object({
  criado_por: z.string(),
  criado_em: z.coerce.date(),
  atualizado_por: z.string(),
  atualizado_em: z.coerce.date(),
});

export const ProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  status: ProductStatusEnum,
  identificacao: IdentificacaoSchema,
  classificacao: ClassificacaoSchema,
  marca: MarcaSchema,
  caracteristicas: CaracteristicasSchema,
  medidas: MedidasSchema,
  // `.default(...)` no campo inteiro (não só nos sub-campos) — diferente dos demais campos
  // deste schema, `peso` é novo e produtos já persistidos no banco não têm essa chave; sem o
  // default aqui, revalidar um documento antigo contra `ProductSchema.parse()` (rotas de
  // listagem/detalhe) quebra com "Required" em `peso`.
  peso: PesoSchema.default(DEFAULT_PESO),
  condicao: CondicaoSchema,
  preco: PrecoSchema,
  estoque: EstoqueSchema,
  imagens: ImagensSchema,
  ecommerce: EcommerceSchema,
  marketplaces: MarketplacesSchema,
  venda: VendaSchema,
  ai_metadata: AiMetadataSchema,
  auditoria: AuditoriaSchema,
});
export type Product = z.infer<typeof ProductSchema>;
