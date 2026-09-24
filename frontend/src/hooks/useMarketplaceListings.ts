import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Marketplace } from "../schemas/marketplace-account.schema";
import { marketplaceListingService, type ShippingChoice } from "../services/marketplace-listing.service";
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
      sizeOverride,
      shipping,
    }: {
      productId: string;
      marketplace: Marketplace;
      accountId: string;
      categoryId?: string;
      listingTypeId?: string;
      sizeOverride?: string;
      shipping?: ShippingChoice;
    }) => marketplaceListingService.publish(productId, marketplace, accountId, categoryId, listingTypeId, sizeOverride, shipping),
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

/** Sugestão de tamanho de calçado (spec 012, achado real 24/09/2026) — depende da categoria já
 * escolhida na revisão; nunca cria nem altera nada. */
export function useSizeSuggestion() {
  return useMutation({
    mutationFn: ({
      productId,
      marketplace,
      accountId,
      categoryId,
    }: {
      productId: string;
      marketplace: Marketplace;
      accountId: string;
      categoryId: string;
    }) => marketplaceListingService.suggestSize(productId, marketplace, accountId, categoryId),
  });
}

/** Sugestão de frete (spec 012, achado real 24/09/2026) — depende da categoria e do tipo de
 * anúncio já escolhidos na revisão; nunca cria nem altera nada. */
export function useShippingSuggestion() {
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
      categoryId: string;
      listingTypeId: string;
    }) => marketplaceListingService.suggestShipping(productId, marketplace, accountId, categoryId, listingTypeId),
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
