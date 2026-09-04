# Container build for Fly.io and any other container host.
#
# Deliberately NOT at bridge/Dockerfile: Railway auto-detects a Dockerfile in
# the service root and would use it instead of Nixpacks, which conflicts with
# the NIXPACKS builder declared in railway.json and fails the image build.
# Keeping it here leaves Railway exactly one build path.
#
#   docker build -f deploy/Dockerfile -t konek-ai-bridge .

FROM node:20-alpine

WORKDIR /app

# Install against the lockfile first so layers cache on source-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# A dropped websocket is a dropped call, so surface an unhealthy container fast.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
