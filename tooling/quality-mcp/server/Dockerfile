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

COPY --from=build /app .

EXPOSE 8080

CMD ["node", "tooling/quality-mcp/server/dist/index.js"]
