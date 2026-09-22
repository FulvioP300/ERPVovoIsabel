import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Marketplace } from "../schemas/marketplace-account.schema";
import { marketplaceListingService } from "../services/marketplace-listing.service";
import { PRODUCTS_QUERY_KEY } from "./useProducts";

export function usePublishListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      marketplace,
      accountId,
      categoryId,
      listingTypeId,
    }: {
      productId: string;
      marketplace: Marketplace;
      accountId: string;
      categoryId?: string;
      listingTypeId?: string;
    }) => marketplaceListingService.publish(productId, marketplace, accountId, categoryId, listingTypeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
  });
}

/** Sugestão de categoria para a tela de revisão (spec 012, seção 4; ADR-025) — nunca cria nem altera nada. */
export function useCategorySuggestion() {
  return useMutation({
    mutationFn: ({ productId, marketplace, accountId }: { productId: string; marketplace: Marketplace; accountId: string }) =>
      marketplaceListingService.suggestCategory(productId, marketplace, accountId),
  });
}

export function useCloseListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, marketplace, accountId }: { productId: string; marketplace: Marketplace; accountId: string }) =>
      marketplaceListingService.close(productId, marketplace, accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
  });
}
