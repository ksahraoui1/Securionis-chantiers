# syntax=docker/dockerfile:1
#
# Image de production en trois étapes (SEC-02, audit du 3 septembre 2026).
#
# L'ancien Dockerfile était mono-étape : `COPY . .` puis `npm run build`, en
# root, sur Node 20. Le `.env` de production — copié faute de `.dockerignore` —
# se retrouvait dans une couche de l'image, et l'image livrée contenait le
# code source, les outils de build et 1 Go de `node_modules`.
#
#   deps     installe les dépendances (cache réutilisé tant que le lock ne
#            change pas)
#   builder  compile en mode `standalone` : Next.js ne garde que les modules
#            réellement importés
#   runner   ne contient que le résultat, tourne sous l'utilisateur `node`
#
# Les `NEXT_PUBLIC_*` sont **inlinées au build** par Next.js : elles arrivent
# ici en `build args` (voir docker-compose.yml), qui les lit dans le `.env`
# du VPS. Ce sont des valeurs publiques par construction. Les secrets ne sont
# fournis qu'au conteneur en marche, par `env_file`.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL=https://chantiers.securionis.com
ARG NEXT_PUBLIC_APP_ENV=production
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# La sortie `standalone` contient `server.js` et le strict nécessaire de
# `node_modules` ; `public/` et `.next/static` ne sont pas inclus et doivent
# être copiés à côté (documentation Next.js).
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

# `/login` est publique et rend une page complète : un 200 prouve que le
# serveur, le routage et le rendu fonctionnent.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/login || exit 1

CMD ["node", "server.js"]
