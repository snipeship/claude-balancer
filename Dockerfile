# Use the official Bun image
FROM oven/bun:latest

# Set working directory
WORKDIR /app

COPY package.json bun.lock* ./

COPY . .

# COPY apps/*/package.json ./apps/
# COPY packages/*/package.json ./packages/

# Install dependencies
RUN bun install

RUN bun run build
# Expose port 8080 (based on CLAUDE.md)
EXPOSE 8080

# Run the server (not the TUI which requires interactive mode)
CMD ["bun", "run", "server"]
