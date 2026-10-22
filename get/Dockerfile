# ---- Stage 1: install production dependencies only ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: small runtime image, non-root ----
FROM node:24-alpine
ENV NODE_ENV=production
# The app only runs `node`; the bundled npm/corepack carry the CVEs Trivy reports.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
USER node
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:8081/health > /dev/null || exit 1
CMD ["node", "src/server.js"]
