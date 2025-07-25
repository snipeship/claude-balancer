# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Claude Load Balancer is a proxy server that distributes requests across multiple Claude OAuth accounts with automatic failover, retry logic, and intelligent model-aware routing. It provides load balancing between Pro Plan (console.anthropic.com) and Max Plan (claude.ai) accounts with special handling for Opus model requests.

## Development Commands

### Setup and Installation
```bash
npm install                    # Install all dependencies
```

### Server Management
```bash
npm start                      # Start server on port 8080
npm run start:8081            # Start server on port 8081
npm run start:8082            # Start server on port 8082
PORT=8083 npm start           # Start server on custom port
npm run dev                   # Start with auto-reload using tsx watch
```

### Build and Type Checking
```bash
npm run build                 # Compile TypeScript to dist/
tsc                          # Type check without building
```

### Account Management CLI
```bash
npm run cli add <name>                    # Add Pro plan account (console mode)
npm run cli add <name> -- --mode max     # Add Max plan account with Opus support
npm run cli list                          # List all accounts with plan/model details
npm run cli remove <name>                 # Remove an account
npm run cli reset-stats                   # Reset usage statistics
npm run cli clear-history                 # Clear request history database
npm run cli help                          # Show CLI help
```

### Testing
```bash
npm test                      # Run basic functionality tests
npm run test:routing          # Test model-aware routing logic
```

### Port Management
```bash
npm run kill-port            # Kill process on port 8080 (example usage)
lsof -ti:8080 | xargs kill   # Alternative port killing command
```

## Architecture Overview

### Core Components

**Server Architecture (src/server-node.ts):**
- HTTP proxy server using Node.js native `http` module
- SQLite database for account and request tracking using `better-sqlite3`
- Model-aware routing system with plan-based account filtering
- Automatic token refresh using OAuth2 refresh tokens
- Built-in web dashboard with real-time statistics

**CLI System (src/cli-node.ts):**
- OAuth2 PKCE flow for secure account authorization
- Plan-aware account management (Pro vs Max plans)
- Interactive prompts using Node.js `readline`
- Database management and statistics operations

### Database Schema

**Accounts Table:**
- Account credentials and OAuth tokens
- Plan type (`console` for Pro, `max` for Max plans)
- Supported models (comma-separated string)
- Usage statistics (request_count, last_used)

**Requests Table:**
- Request tracking with response times
- Failover attempt counting
- Success/failure tracking with error messages

### Model-Aware Routing System

**Plan Restrictions:**
- **Pro Plan (console):** claude-3-5-sonnet-20241022, claude-3-haiku-20240307, claude-3-5-haiku-20241022
- **Max Plan (max):** All Pro models + claude-3-opus-20240229

**Routing Logic:**
1. Extract `model` field from request body JSON
2. Filter accounts based on model compatibility
3. Route to compatible account with least usage
4. Automatic failover to next compatible account on failure
5. Return 403 error if no compatible accounts exist

### Configuration Constants
```typescript
const RETRY_COUNT = 3        // Retries per account
const RETRY_DELAY_MS = 1000  // Initial retry delay
const RETRY_BACKOFF = 2      // Exponential backoff multiplier
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"  // Anthropic OAuth client
```

## API Endpoints

### Dashboard and Monitoring
- `GET /` or `/dashboard` - Web dashboard UI
- `GET /health` - Health check with account count
- `GET /api/stats` - Aggregated statistics (total requests, success rate, etc.)
- `GET /api/accounts` - Account information with token validity
- `GET /api/requests?limit=50` - Request history with failover details

### Proxy Endpoints
- `POST /v1/messages` - Main Claude API endpoint (most common)
- All `/v1/*` paths are proxied to `https://api.anthropic.com`

## Development Workflow

### Adding New Features
1. Modify TypeScript source files in `src/`
2. Test locally with `npm run dev` for auto-reload
3. Use `npm run build` to verify TypeScript compilation
4. Test CLI changes with `npm run cli help`
5. Verify database schema changes don't break existing data

### Database Migrations
The application handles schema migrations automatically:
- New columns added with `ALTER TABLE` and try/catch blocks
- Existing data preserved during upgrades
- Default values provided for new columns

### OAuth Integration
- Uses PKCE (Proof Key for Code Exchange) for security
- Supports both console.anthropic.com and claude.ai endpoints
- Automatic token refresh before expiration
- Handles authorization errors gracefully

## File Structure

```
src/
├── server-node.ts    # Main Node.js server (current production version)
├── cli-node.ts       # Node.js CLI tool (current production version)
├── server.ts         # Original Bun server (legacy, preserved)
└── cli.ts           # Original Bun CLI (legacy, preserved)

# Configuration
package.json         # Dependencies and npm scripts
tsconfig.json        # TypeScript configuration
claude-accounts.db   # SQLite database (created at runtime)

# Documentation
README.md                # Main documentation
README-MODEL-ROUTING.md  # Model routing feature details
README-NODEJS.md         # Node.js setup instructions
```

## Common Development Tasks

### Testing Model Routing
```bash
# Test with different models to verify routing
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-opus-20240229", "messages": [...]}' 
```

### Database Inspection
The SQLite database `claude-accounts.db` can be inspected with:
```bash
sqlite3 claude-accounts.db ".tables"
sqlite3 claude-accounts.db "SELECT * FROM accounts;"
sqlite3 claude-accounts.db "SELECT * FROM requests ORDER BY timestamp DESC LIMIT 10;"
```

### Error Handling
- 4xx errors from Anthropic API are passed through directly
- 429 (rate limit) and 5xx errors trigger retries and failover
- 503 errors indicate all accounts failed or no compatible accounts
- 403 errors indicate model/plan compatibility issues

## Performance Considerations
- Uses connection pooling via Node.js http module
- SQLite database with indexes on timestamp for fast queries
- Minimal memory footprint for request/response proxying
- Automatic cleanup of old request history can be implemented as needed

## Security Notes
- OAuth tokens stored in local SQLite database
- No API keys or secrets in source code
- CORS headers configured for dashboard access
- Request/response data not logged to prevent data leakage