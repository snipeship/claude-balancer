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

# Install database tools for repair and debugging
# SQLite for default database, PostgreSQL and MySQL clients for external databases
RUN apk add --no-cache sqlite postgresql-client mysql-client

# Create non-root user
RUN addgroup -g 1001 -S ccflare && \
    adduser -S ccflare -u 1001 -G ccflare

# Copy built application
COPY --from=builder --chown=ccflare:ccflare /app .

# Copy repair scripts
COPY --chown=ccflare:ccflare scripts/ /app/scripts/
RUN find /app/scripts -name '*.sh' -type f -exec chmod +x {} + 2>/dev/null || true

# Create data directory for SQLite database (when using SQLite)
RUN mkdir -p /app/data && chown ccflare:ccflare /app/data

# Switch to non-root user
USER ccflare

# Set API key for authentication (change this in production!)
ENV API_KEY=ccflare-default-key

# Database configuration
# Default to SQLite with persistent volume mount
ENV DATABASE_PROVIDER=sqlite
ENV ccflare_DB_PATH=/app/data/ccflare.db

# For PostgreSQL/MySQL, override these environment variables:
# ENV DATABASE_PROVIDER=postgresql
# ENV DATABASE_URL=postgresql://user:password@host:5432/database
# or
# ENV DATABASE_PROVIDER=mysql
# ENV DATABASE_URL=mysql://user:password@host:3306/database

# Expose port
EXPOSE 8080

# Start the server (not TUI)
CMD ["bun", "run", "server"]