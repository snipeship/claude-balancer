# Multi-stage build for ccflare
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY package.json bun.lock* ./

# Copy all source code (required for workspace dependencies)
COPY . .

# Install dependencies
RUN bun install --frozen-lockfile

# Build the project
RUN bun run build

# Production stage
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S ccflare && \
    adduser -S ccflare -u 1001

# Copy built application
COPY --from=builder --chown=ccflare:ccflare /app .

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown ccflare:ccflare /app/data

# Switch to non-root user
USER ccflare

# Set API key for authentication (change this in production!)
ENV API_KEY=ccflare-default-key

# Set database path to persistent volume mount
ENV ccflare_DB_PATH=/app/data/ccflare.db

# Expose port
EXPOSE 8080

# Start the server (not TUI)
CMD ["bun", "run", "server"]