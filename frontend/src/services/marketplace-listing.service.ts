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

export const marketplaceListingService = {
  async publish(productId: string, marketplace: Marketplace, accountId: string): Promise<Product> {
    const response = await fetch(`/api/products/${productId}/marketplace-listings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ marketplace, accountId }),
    });
    return ProductSchema.parse(await parseEnvelope<unknown>(response));
  },
};
