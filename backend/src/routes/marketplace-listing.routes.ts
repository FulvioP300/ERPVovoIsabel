import type { FastifyInstance } from "fastify";
import { authorize } from "../middleware/authorize.middleware.js";
import { MarketplaceEnum } from "../schemas/marketplace-account.schema.js";
import { z } from "zod";
import { ProductSchema } from "../schemas/product.schema.js";
import { ProductNotFoundError } from "../services/product.service.js";
import { MarketplaceAccountNotFoundError } from "../services/marketplace-account.service.js";
import { AccountBusyError } from "../services/account-operation.service.js";
import {
  AccountNotReadyError,
  ListingNotPublishedError,
  MarketplaceAccountMismatchError,
  ProductMissingRequiredFieldsError,
  closeListing,
  publishListing,
} from "../services/marketplace-listing.service.js";
import {
  MarketplaceSuggestionUnsupportedError,
  suggestCategory,
} from "../services/marketplace-category-suggestion.service.js";
import { CategoryCatalogError } from "../plugins/marketplaces/mercado-livre-category-catalog.js";

const PublishListingBodySchema = z.object({
  marketplace: MarketplaceEnum,
  accountId: z.string().min(1),
  // Categoria e tipo de anúncio confirmados na tela de revisão (spec 012, seções 3.2 e 4; ADR-025,
  // ADR-026) — opcionais na porta comum (011, seção 4.1); cada conector decide se exige. Ainda sem
  // consumidor real (T023/T025).
  categoryId: z.string().min(1).optional(),
  listingTypeId: z.string().min(1).optional(),
});

const CloseListingBodySchema = z.object({
  marketplace: MarketplaceEnum,
  accountId: z.string().min(1),
});

const CategorySuggestionBodySchema = z.object({
  marketplace: MarketplaceEnum,
  accountId: z.string().min(1),
});

const CategoryOptionSchema = z.object({
  categoryId: z.string().min(1),
  categoryName: z.string().min(1),
});

const CategorySuggestionResponseSchema = z.object({
  suggested: CategoryOptionSchema.nullable(),
  options: z.array(CategoryOptionSchema),
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
          categoryId: parseResult.data.categoryId,
          listingTypeId: parseResult.data.listingTypeId,
        });
        return { success: true, data: ProductSchema.parse(product) };
      } catch (err) {
        if (err instanceof ProductNotFoundError || err instanceof MarketplaceAccountNotFoundError) {
          return reply.code(404).send({ success: false, error: err.message });
        }
        if (err instanceof ProductMissingRequiredFieldsError || err instanceof MarketplaceAccountMismatchError) {
          return reply.code(400).send({ success: false, error: err.message });
        }
        if (err instanceof AccountBusyError) {
          return reply.code(409).send({ success: false, error: err.message });
        }
        throw err;
      }
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/marketplace-listings/close",
    { preHandler: [fastify.authenticate, authorize(["admin", "operator"])] },
    async (request, reply) => {
      const parseResult = CloseListingBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ success: false, error: "Dados de encerramento inválidos." });
      }

      try {
        const product = await closeListing({
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
        if (err instanceof ListingNotPublishedError || err instanceof AccountNotReadyError) {
          return reply.code(409).send({ success: false, error: err.message });
        }
        if (err instanceof AccountBusyError) {
          return reply.code(409).send({ success: false, error: err.message });
        }
        throw err;
      }
    },
  );

  // Sugestão de categoria para a tela de revisão (spec 012, seção 4; spec 011, seção 4.5; ADR-025)
  // — só consulta, nunca cria nem altera nada.
  fastify.post<{ Params: { id: string } }>(
    "/:id/marketplace-category-suggestion",
    { preHandler: [fastify.authenticate, authorize(["admin", "operator"])] },
    async (request, reply) => {
      const parseResult = CategorySuggestionBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({ success: false, error: "Dados de sugestão de categoria inválidos." });
      }

      try {
        const result = await suggestCategory({
          productId: request.params.id,
          marketplace: parseResult.data.marketplace,
          accountId: parseResult.data.accountId,
        });
        return { success: true, data: CategorySuggestionResponseSchema.parse(result) };
      } catch (err) {
        if (err instanceof ProductNotFoundError || err instanceof MarketplaceAccountNotFoundError) {
          return reply.code(404).send({ success: false, error: err.message });
        }
        if (err instanceof MarketplaceAccountMismatchError || err instanceof MarketplaceSuggestionUnsupportedError) {
          return reply.code(400).send({ success: false, error: err.message });
        }
        if (err instanceof AccountBusyError) {
          return reply.code(409).send({ success: false, error: err.message });
        }
        if (err instanceof CategoryCatalogError) {
          return reply.code(500).send({ success: false, error: err.message });
        }
        throw err;
      }
    },
  );
}
