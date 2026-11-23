FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=build_ca,required=false \
    if [ -f /run/secrets/build_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/build_ca npm ci; else npm ci; fi
COPY . .
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts --no-audit

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
RUN addgroup -S incys && adduser -S incys -G incys
COPY --from=build --chown=incys:incys /app/.next/standalone ./
COPY --from=build --chown=incys:incys /app/.next/static ./.next/static
COPY --from=build --chown=incys:incys /app/scripts ./scripts
COPY --from=build --chown=incys:incys /app/server ./server
COPY --from=build --chown=incys:incys /app/database ./database
COPY --from=build --chown=incys:incys /app/node_modules ./node_modules
USER incys
EXPOSE 8080
CMD ["node", "server.js"]
