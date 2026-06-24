FROM node:20-slim

# openssl + ca-certificates are required by the Prisma query engine at runtime.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Build the app (prisma generate + next build).
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["bash", "./docker-entrypoint.sh"]
