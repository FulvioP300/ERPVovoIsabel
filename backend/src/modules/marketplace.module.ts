import type { FastifyInstance } from "fastify";
import marketplaceAccountRoutes from "../routes/marketplace-account.routes.js";
import marketplaceListingRoutes from "../routes/marketplace-listing.routes.js";

export default async function marketplaceModule(fastify: FastifyInstance) {
  await fastify.register(marketplaceAccountRoutes, { prefix: "/api/marketplace-accounts" });
  await fastify.register(marketplaceListingRoutes, { prefix: "/api/products" });
}
