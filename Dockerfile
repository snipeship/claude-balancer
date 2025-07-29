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

# Expose port
EXPOSE 8080

# Start the server (not TUI)
CMD ["bun", "run", "server"]