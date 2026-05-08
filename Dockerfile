FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders only. Runtime values come from docker-compose.prod.yml.
ENV DATABASE_URL=postgres://admin:postgres@db:5432/insurance
ENV JWT_SECRET=build_time_placeholder_change_at_runtime
ENV ANTHROPIC_API_KEY=sk-ant-replace-at-runtime
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# The standalone Next.js output is enough for the web server, but the
# production image also runs sidecar commands (migrations + reminders worker).
# Keep production dependencies available for those Node entrypoints too.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/worker ./worker
EXPOSE 3000
CMD ["node", "server.js"]
