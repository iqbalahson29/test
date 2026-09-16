FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.24.0
WORKDIR /repo
FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @quiz-platform/shared build && pnpm --filter @quiz-platform/shared build:cjs
RUN pnpm --filter @quiz-platform/api exec prisma generate && pnpm --filter @quiz-platform/api build
# Only explicit runtime files and production dependencies enter the API image.
RUN pnpm --filter @quiz-platform/api deploy --prod /runtime
# `pnpm deploy` builds an isolated dependency tree, so the client generated above is not
# carried into it. Resolve both trees through Node and assert the result: a missing client
# must fail the build here rather than at container start.
RUN node apps/api/scripts/package-prisma-client.mjs /runtime /repo/apps/api
# Shipped so the final image can be verified as the user that actually runs it.
RUN cp apps/api/scripts/verify-prisma-runtime.mjs /runtime/verify-prisma-runtime.mjs
FROM build AS operations
ENV NODE_ENV=production
WORKDIR /repo/apps/api
CMD ["pnpm", "auth:config-check"]
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /runtime /app
WORKDIR /app
USER node
# Fails the build if the packaged client cannot initialize under the runtime user.
RUN node verify-prisma-runtime.mjs
EXPOSE 3000
CMD ["node", "dist/main.js"]
