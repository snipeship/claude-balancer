# Claude Load Balancer - Node.js Setup

This repository has been adapted to work with Node.js instead of Bun, making it compatible with most development environments.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm start
```

The server will start on port 8080 and display:
- 🚀 Claude proxy server running on http://localhost:8080
- 📊 Dashboard: http://localhost:8080/dashboard  
- 🔍 Health check: http://localhost:8080/health

**If port 8080 is in use:**
```bash
# Option 1: Use a different port
PORT=8081 npm start

# Option 2: Kill existing process and retry
lsof -ti:8080 | xargs kill
npm start

# Option 3: Use predefined scripts
npm run start:8081   # Start on port 8081
npm run start:8082   # Start on port 8082
```

### 3. Add Claude Accounts

Use the CLI to add your Claude accounts:

```bash
# Add a console.anthropic.com account
npm run cli add account1

# Add a claude.ai account  
npm run cli add account2 -- --mode max
```

Follow the authorization prompts to authenticate each account.

### 4. Manage Accounts

```bash
# List all accounts
npm run cli list

# Remove an account
npm run cli remove account1

# Reset usage statistics
npm run cli reset-stats

# Clear request history
npm run cli clear-history

# Show help
npm run cli help
```

### 5. Use as Proxy

Configure your Claude Code or other applications to use the load balancer:

```bash
export ANTHROPIC_BASE_URL=http://localhost:8080
```

## Key Changes from Original

- **Database**: Uses `better-sqlite3` instead of `bun:sqlite`
- **HTTP Server**: Uses Node.js `http` module instead of Bun's `serve`
- **TypeScript**: Uses `tsx` for TypeScript execution
- **Fetch**: Uses `node-fetch` for HTTP requests
- **CLI Input**: Uses `readline` instead of `prompt()`

## Files

- `src/server-node.ts` - Node.js compatible server
- `src/cli-node.ts` - Node.js compatible CLI
- `src/server.ts` - Original Bun server (preserved)
- `src/cli.ts` - Original Bun CLI (preserved)

## npm Scripts

- `npm start` - Start the Node.js server
- `npm run cli` - Run the Node.js CLI
- `npm run dev` - Start server with auto-reload
- `npm run build` - Build TypeScript
- `npm run original:start` - Run original Bun server
- `npm run original:cli` - Run original Bun CLI

## Features

All original features are preserved:

- ✅ **Load Balancing**: Distributes requests across multiple Claude accounts
- ✅ **Automatic Failover**: Retries with other accounts on failure
- ✅ **Retry Logic**: 3 retries per account with exponential backoff
- ✅ **Request Tracking**: SQLite database for monitoring
- ✅ **Web Dashboard**: Real-time monitoring UI
- ✅ **Enhanced Logging**: Detailed request/response logging
- ✅ **Token Management**: Automatic token refresh

The dashboard shows:
- Total requests and success rate
- Active accounts and token status  
- Average response time
- Request history with failover details

All API endpoints work exactly as documented in the original README.