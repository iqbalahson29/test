# Build context is the repo ROOT (see docker-compose.yml `context: .`),
# because this is a pnpm workspace: apps/api depends on the
# @quiz-platform/shared workspace package, so the whole monorepo has to be
# present for `pnpm install` to link it correctly.

FROM node:22-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9

# ---- build ----
FROM base AS build
# bcrypt has a native addon that must be compiled for this image's platform.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @quiz-platform/shared build \
    && pnpm --filter @quiz-platform/shared build:cjs
RUN pnpm --filter @quiz-platform/api exec prisma generate
RUN pnpm --filter @quiz-platform/api build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=docker
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
