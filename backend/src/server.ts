import "dotenv/config";
import Fastify from "fastify";

const server = Fastify({ logger: true });

server.get("/api/health", async () => ({ status: "ok" }));

const port = Number(process.env.PORT ?? 3333);

server
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    server.log.error(err);
    process.exit(1);
  });
