# Use the official Bun image
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy package.json and bun.lockb
COPY package.json bun.lock* ./

# Copy the rest of the application
COPY . .

# Install dependencies
RUN bun install

# Build the project
RUN bun run build

# Expose port 8080
EXPOSE 8080

# Run the server (not the TUI which requires interactive mode)
CMD ["bun", "run", "server"]
