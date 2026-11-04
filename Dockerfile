# ---------- Build : front Vite + typecheck ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Dépendances de prod uniquement ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Runtime ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/info" >/dev/null || exit 1

# tsx exécute directement le TypeScript du serveur (pas d'étape de compilation à maintenir)
CMD ["node_modules/.bin/tsx", "server/index.ts"]
