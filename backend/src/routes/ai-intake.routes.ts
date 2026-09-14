import type { FastifyInstance } from "fastify";
import { authorize } from "../middleware/authorize.middleware.js";
import { AiAnalysisInputSchema } from "../schemas/ai-intake.schema.js";
import { CreateProductSchema, ProductSchema } from "../schemas/product.schema.js";
import {
  InvalidAiResponseError,
  NoImagesProvidedError,
  TooManyImagesError,
  analyzeProduct,
} from "../services/ai-intake.service.js";
import { InvalidCategoryError } from "../services/category.service.js";
import { ImageTooLargeError, InvalidImageTypeError } from "../services/image.service.js";
import { confirmProduct } from "../services/product-confirm.service.js";

/** Limite configurável (spec 006, seção 7) — conter custo de IA e tentativas de prompt
 * injection por força bruta (spec, seção 8.2-H). */
const AI_ANALYZE_RATE_LIMIT = Number(process.env.AI_ANALYZE_RATE_LIMIT ?? 10);

export default async function aiIntakeRoutes(fastify: FastifyInstance) {
  // Análise e confirmação exigem admin/operator — viewer nunca cadastra produto (002), nem
  // por IA nem manualmente (mesma regra de escrita de 005).
  const writeGuard = { preHandler: [fastify.authenticate, authorize(["admin", "operator"])] };

  fastify.post(
    "/analyze",
    {
      ...writeGuard,
      config: { rateLimit: { max: AI_ANALYZE_RATE_LIMIT, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      let prompt: string | undefined;
      const images: { buffer: Buffer; mimeType: string }[] = [];

      for await (const part of request.parts()) {
        if (part.type === "file") {
          images.push({ buffer: await part.toBuffer(), mimeType: part.mimetype });
        } else if (part.fieldname === "prompt" && typeof part.value === "string") {
          prompt = part.value;
        }
      }

      const parseResult = AiAnalysisInputSchema.safeParse({ prompt });
      if (!parseResult.success) {
        return reply.code(400).send({ success: false, error: "Descreva a peça antes de analisar." });
      }

      try {
        const suggestion = await analyzeProduct({ prompt: parseResult.data.prompt, images });
        return { success: true, data: suggestion };
      } catch (err) {
        if (
          err instanceof NoImagesProvidedError ||
          err instanceof TooManyImagesError ||
          err instanceof InvalidImageTypeError ||
          err instanceof ImageTooLargeError ||
          err instanceof InvalidAiResponseError
        ) {
          return reply.code(400).send({ success: false, error: err.message });
        }
        throw err;
      }
    },
  );

  // Endpoint distinto de /analyze (nunca o mesmo request) — análise nunca persiste nem gera
  // SKU (constituição, princípio I; spec, seção 4). Contrato idêntico ao POST /products (005):
  // o produto revisado chega no mesmo formato de `CreateProductSchema`.
  fastify.post("/confirm", writeGuard, async (request, reply) => {
    const parseResult = CreateProductSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ success: false, error: "Dados de produto inválidos." });
    }

    try {
      const product = await confirmProduct({ ...parseResult.data, actingUserId: request.user!.id });
      return reply.code(201).send({ success: true, data: ProductSchema.parse(product) });
    } catch (err) {
      if (err instanceof InvalidCategoryError) {
        return reply.code(400).send({ success: false, error: err.message });
      }
      throw err;
    }
  });
}
