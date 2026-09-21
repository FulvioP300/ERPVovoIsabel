import type { FastifyInstance } from "fastify";
import { authorize } from "../middleware/authorize.middleware.js";
import { MarketplaceEnum } from "../schemas/marketplace-account.schema.js";
import { z } from "zod";
import { ProductSchema } from "../schemas/product.schema.js";
import { ProductNotFoundError } from "../services/product.service.js";
import { MarketplaceAccountNotFoundError } from "../services/marketplace-account.service.js";
import {
  MarketplaceAccountMismatchError,
  ProductMissingRequiredFieldsError,
  publishListing,
} from "../services/marketplace-listing.service.js";

const PublishListingBodySchema = z.object({
  marketplace: MarketplaceEnum,
  accountId: z.string().min(1),
});

export default async function marketplaceListingRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>(
    "/:id/marketplace-listings",
    { preHandler: [fastify.authenticate, authorize(["admin", "operator"])] },
    async (request, reply) => {
      const parseResult = PublishListingBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ success: false, error: "Dados de publicação inválidos." });
      }

      try {
        const product = await publishListing({
          productId: request.params.id,
          marketplace: parseResult.data.marketplace,
          accountId: parseResult.data.accountId,
          actingUserId: request.user!.id,
        });
        return { success: true, data: ProductSchema.parse(product) };
      } catch (err) {
        if (err instanceof ProductNotFoundError || err instanceof MarketplaceAccountNotFoundError) {
          return reply.code(404).send({ success: false, error: err.message });
        }
        if (err instanceof ProductMissingRequiredFieldsError || err instanceof MarketplaceAccountMismatchError) {
          return reply.code(400).send({ success: false, error: err.message });
        }
        throw err;
      }
    },
  );
}
