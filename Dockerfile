# syntax=docker/dockerfile:1
#
# Imagem única (spec 010): backend serve o build estático do frontend no mesmo processo/porta.
# Build de contexto: raiz do monorepo (`docker build .` a partir daqui).

# ---------------------------------------------------------------------------
# Estágio 1 — build de shared/ (schemas Zod compartilhados)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS shared-build
WORKDIR /app/shared
COPY shared/package.json shared/package-lock.json ./
RUN npm ci
COPY shared/ .
RUN npm run build

# ---------------------------------------------------------------------------
# Estágio 2 — build de backend/ (depende de shared/dist para type-check + runtime)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ .
COPY --from=shared-build /app/shared/dist /app/shared/dist
# shared/node_modules também — os .d.ts gerados em shared/dist importam "zod", e a resolução de
# módulos (TS aqui no build, Node em runtime) procura node_modules subindo a partir de
# shared/dist/, nunca em backend/node_modules (é um diretório irmão, não ancestral).
COPY --from=shared-build /app/shared/node_modules /app/shared/node_modules
RUN npm run build
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------
# Estágio 3 — build de frontend/ (depende de shared/dist, Vite empacota em build-time)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
COPY --from=shared-build /app/shared/dist /app/shared/dist
COPY --from=shared-build /app/shared/node_modules /app/shared/node_modules
RUN npm run build

# ---------------------------------------------------------------------------
# Estágio final — runtime: só artefatos compilados + node_modules de produção do backend.
# Nunca código-fonte TypeScript nem devDependencies (spec 010, seção 4).
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app/backend

COPY --from=backend-build --chown=node:node /app/backend/dist ./dist
COPY --from=backend-build --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=backend-build --chown=node:node /app/backend/package.json ./package.json
COPY --from=shared-build --chown=node:node /app/shared/dist /app/shared/dist
# shared/node_modules em runtime também: o backend.js compilado ainda faz "import ... from
# 'zod'" dentro de shared/dist/schemas/*.js, resolvido a partir da localização desse arquivo.
COPY --from=shared-build --chown=node:node /app/shared/node_modules /app/shared/node_modules
COPY --from=frontend-build --chown=node:node /app/frontend/dist /app/frontend/dist

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
