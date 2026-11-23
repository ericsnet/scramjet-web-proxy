FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY scripts ./scripts
RUN node scripts/patch-wisp.mjs

COPY . .

RUN mkdir -p data backups && chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
USER node
EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3030/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
