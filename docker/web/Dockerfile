# Build stage
FROM node:20.11.1-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 py3-pip bash git \
    && rm -f /usr/lib/python*/EXTERNALLY-MANAGED \
    && python3 -m ensurepip \
    && pip3 install --no-cache-dir awscli \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Cache package files for better layer caching
COPY package.json yarn.lock nx.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/

# Install dependencies with frozen lockfile
RUN yarn install --frozen-lockfile --network-timeout 100000

# Copy code
COPY . .

# Build arguments for environment configuration
ARG VITE_ENV
ARG VITE_PROJECT
ARG VITE_HOST
ARG VITE_OAUTH_ENDPOINT
ARG VITE_SOCIAL_OAUTH_ENDPOINT
ARG VITE_IMAGE_API_ENDPOINT

# Create environment file
RUN printf "VITE_ENV=%s\nVITE_PROJECT=%s\nVITE_HOST=%s\nVITE_OAUTH_ENDPOINT=%s\nVITE_SOCIAL_OAUTH_ENDPOINT=%s\nVITE_IMAGE_API_ENDPOINT=%s\n" \
    "${VITE_ENV}" \
    "${VITE_PROJECT}" \
    "${VITE_HOST}" \
    "${VITE_OAUTH_ENDPOINT}" \
    "${VITE_SOCIAL_OAUTH_ENDPOINT}" \
    "${VITE_IMAGE_API_ENDPOINT}" \
    > apps/web/.env.prod

# Build the application
RUN yarn web:build:prod

# Deploy stage
FROM node:20.11.1-alpine AS deploy

# Install only runtime dependencies
RUN apk add --no-cache python3 py3-pip bash \
    && rm -f /usr/lib/python*/EXTERNALLY-MANAGED \
    && python3 -m ensurepip \
    && pip3 install --no-cache-dir awscli \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY scripts/docker-entrypoint-deploy.sh ./scripts/

# Make scripts executable
RUN chmod +x scripts/docker-entrypoint-deploy.sh

# Add non-root user for security
RUN addgroup -g 1001 -S appuser && \
    adduser -S -u 1001 -G appuser appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Default command
CMD ["/bin/bash"]
