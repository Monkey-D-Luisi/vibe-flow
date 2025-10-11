ARG PORT=8080

FROM node:20-alpine AS build
WORKDIR /app

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY services ./services
COPY tooling ./tooling

RUN pnpm install --frozen-lockfile
RUN pnpm -r build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Copy only the runtime artifacts required for the HTTP server
COPY --from=build /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=build /app/node_modules/.bin ./node_modules/.bin
COPY --from=build /app/tooling/quality-mcp/server/dist ./tooling/quality-mcp/server/dist
COPY --from=build /app/tooling/quality-mcp/server/package.json ./tooling/quality-mcp/server/package.json
COPY --from=build /app/tooling/quality-mcp/server/node_modules ./tooling/quality-mcp/server/node_modules

ARG PORT
ENV PORT=$PORT

# Expose the configured port (BuildKit is required for variable expansion).
EXPOSE $PORT

CMD ["node", "tooling/quality-mcp/server/dist/index.js"]
