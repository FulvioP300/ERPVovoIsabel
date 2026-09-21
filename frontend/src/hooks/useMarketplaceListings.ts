import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Marketplace } from "../schemas/marketplace-account.schema";
import { marketplaceListingService } from "../services/marketplace-listing.service";
import { PRODUCTS_QUERY_KEY } from "./useProducts";

export function usePublishListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, marketplace, accountId }: { productId: string; marketplace: Marketplace; accountId: string }) =>
      marketplaceListingService.publish(productId, marketplace, accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
  });
}
