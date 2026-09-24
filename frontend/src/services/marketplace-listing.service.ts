import { z } from "zod";
import { ProductSchema } from "../schemas/product.schema";
import type { Product } from "../schemas/product.schema";
import type { Marketplace } from "../schemas/marketplace-account.schema";

export class ApiError extends Error {}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !body.success) {
    throw new ApiError(body.error ?? "Erro inesperado. Tente novamente.");
  }
  return body.data as T;
}

/** Categoria de revisão do Mercado Livre (spec 012, seção 4; ADR-025). */
const CategoryOptionSchema = z.object({
  categoryId: z.string().min(1),
  categoryName: z.string().min(1),
});
export type CategoryOption = z.infer<typeof CategoryOptionSchema>;

const CategorySuggestionSchema = z.object({
  suggested: CategoryOptionSchema.nullable(),
  options: z.array(CategoryOptionSchema),
});
export type CategorySuggestion = z.infer<typeof CategorySuggestionSchema>;

/** Sugestão de tamanho de calçado pra revisão (spec 012; achado real 24/09/2026) — só quando a
 * categoria escolhida usa tabela BRAND/STANDARD (`applicable`). */
const FootwearSizeSuggestionSchema = z.object({
  applicable: z.boolean(),
  available: z.array(z.string()),
  current: z.string().nullable(),
  currentMatches: z.boolean(),
});
export type FootwearSizeSuggestion = z.infer<typeof FootwearSizeSuggestionSchema>;

export const marketplaceListingService = {
  async publish(
    productId: string,
    marketplace: Marketplace,
    accountId: string,
    categoryId?: string,
    listingTypeId?: string,
    sizeOverride?: string,
  ): Promise<Product> {
    const response = await fetch(`/api/products/${productId}/marketplace-listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        marketplace,
        accountId,
        ...(categoryId ? { categoryId } : {}),
        ...(listingTypeId ? { listingTypeId } : {}),
        ...(sizeOverride ? { sizeOverride } : {}),
      }),
    });
    return ProductSchema.parse(await parseEnvelope<unknown>(response));
  },

  async close(productId: string, marketplace: Marketplace, accountId: string): Promise<Product> {
    const response = await fetch(`/api/products/${productId}/marketplace-listings/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ marketplace, accountId }),
    });
    return ProductSchema.parse(await parseEnvelope<unknown>(response));
  },

  async suggestCategory(productId: string, marketplace: Marketplace, accountId: string): Promise<CategorySuggestion> {
    const response = await fetch(`/api/products/${productId}/marketplace-category-suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ marketplace, accountId }),
    });
    return CategorySuggestionSchema.parse(await parseEnvelope<unknown>(response));
  },

  /** Depende da categoria já escolhida/confirmada na revisão (spec 012, achado real 24/09/2026). */
  async suggestSize(productId: string, marketplace: Marketplace, accountId: string, categoryId: string): Promise<FootwearSizeSuggestion> {
    const response = await fetch(`/api/products/${productId}/marketplace-size-suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ marketplace, accountId, categoryId }),
    });
    return FootwearSizeSuggestionSchema.parse(await parseEnvelope<unknown>(response));
  },
};
