# Load Balancing in ccflare

## Table of Contents
1. [Overview](#overview)
2. [Session-Based Strategy](#session-based-strategy)
3. [Configuration](#configuration)
4. [Account Selection Process](#account-selection-process)
5. [Performance Considerations](#performance-considerations)
6. [Important: Why Only Session-Based Strategy](#important-why-only-session-based-strategy)

## Overview

ccflare implements a session-based load balancing system to distribute requests across multiple Claude OAuth accounts, avoiding rate limits and ensuring high availability. The system maintains configurable sessions (default: 5 hours) with individual accounts to minimize rate limit issues.

### Key Features
- **Account Health Monitoring**: Automatically filters out rate-limited or paused accounts
- **Failover Support**: Returns ordered lists of accounts for automatic failover
- **Session Persistence**: Maintains configurable sessions on specific accounts
- **Real-time Configuration**: Change settings without restarting the server
- **Provider Filtering**: Accounts are filtered by provider compatibility

## Session-Based Strategy

**Description**: Maintains sticky sessions with individual accounts for a configurable duration (default: 5 hours). This is the only load balancing strategy available in ccflare, designed to minimize account switching and reduce the likelihood of hitting rate limits.

**Use Case**: Optimal for production environments where minimizing rate limits is crucial. Particularly effective for applications with sustained user sessions.

**Implementation Details**:
```typescript
export class SessionStrategy implements LoadBalancingStrategy {
    private sessionDurationMs: number;
    private store: StrategyStore | null = null;
    private log = new Logger("SessionStrategy");

    constructor(sessionDurationMs: number = TIME_CONSTANTS.SESSION_DURATION_DEFAULT) {
        this.sessionDurationMs = sessionDurationMs;
    }

    initialize(store: StrategyStore): void {
        this.store = store;
    }

    select(accounts: Account[], _meta: RequestMeta): Account[] {
        const now = Date.now();
        
        // Find account with most recent active session
        let activeAccount: Account | null = null;
        let mostRecentSessionStart = 0;
        
        for (const account of accounts) {
            if (account.session_start && 
                now - account.session_start < this.sessionDurationMs &&
                account.session_start > mostRecentSessionStart) {
                activeAccount = account;
                mostRecentSessionStart = account.session_start;
            }
        }
        
        // Use active account if available
        if (activeAccount && isAccountAvailable(activeAccount, now)) {
            const others = accounts.filter(
                a => a.id !== activeAccount.id && isAccountAvailable(a, now)
            );
            return [activeAccount, ...others]; // Active account first, others as fallback
        }
        
        // No active session - start new one with first available account
        const available = accounts.filter(a => isAccountAvailable(a, now));
        if (available.length === 0) return [];
        
        const chosenAccount = available[0];
        this.resetSessionIfExpired(chosenAccount);
        
        const others = available.filter(a => a.id !== chosenAccount.id);
        return [chosenAccount, ...others];
    }
}
```

**Characteristics**:
- ✅ **Excellent Rate Limit Avoidance**: Minimizes account switching
- ✅ **Predictable Behavior**: Consistent account usage patterns
- ✅ **Good for Long Sessions**: Ideal for extended AI conversations
- ⚠️ **Uneven Load Distribution**: May concentrate load on fewer accounts
- ⚠️ **Session Dependency**: Performance tied to specific account availability

## Configuration

ccflare uses a hierarchical configuration system where environment variables take precedence over configuration file settings.

### Configuration Precedence (highest to lowest)
1. Environment variables
2. Configuration file (`~/.ccflare/config.json`)
3. Default values

### Environment Variables

```bash
# Load balancing strategy (only 'session' is supported)
LB_STRATEGY=session

# Session duration in milliseconds (default: 18000000ms = 5 hours)
SESSION_DURATION_MS=18000000

# Server port (default: 8080)
PORT=8080

# Client ID for OAuth (default: 9d1c250a-e61b-44d9-88ed-5944d1962f5e)
CLIENT_ID=your-client-id

# Retry configuration
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=1000
RETRY_BACKOFF=2
```

### Configuration File

The configuration file is automatically created at `~/.ccflare/config.json` on first run:

```json
{
    "lb_strategy": "session",
    "session_duration_ms": 18000000,
    "port": 8080,
    "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    "retry_attempts": 3,
    "retry_delay_ms": 1000,
    "retry_backoff": 2
}
```

### Time Constants

The following time constants are used throughout the system:
- `SESSION_DURATION_DEFAULT`: 18000000ms (5 hours)
- `SESSION_DURATION_FALLBACK`: 3600000ms (1 hour) - used if configuration is invalid

### Dynamic Configuration

The strategy configuration can be changed at runtime via the HTTP API:

```bash
# Get current strategy
curl http://localhost:8080/api/config/strategy

# Update strategy (only 'session' is valid)
curl -X PUT http://localhost:8080/api/config/strategy \
  -H "Content-Type: application/json" \
  -d '{"strategy": "session"}'

# Get all configuration settings
curl http://localhost:8080/api/config

# Get available strategies
curl http://localhost:8080/api/config/strategies
```

## Account Selection Process

The load balancer follows a specific process when selecting accounts for requests:

### 1. Account Filtering
```typescript
// From proxy/handlers/account-selector.ts
const providerAccounts = allAccounts.filter(
    (account) => account.provider === ctx.provider.name || account.provider === null
);
```
- Accounts are first filtered by provider compatibility
- Only accounts matching the current provider or with null provider are considered

### 2. Availability Check
```typescript
// From core/strategy.ts
export function isAccountAvailable(account: Account, now = Date.now()): boolean {
    return (
        !account.paused &&
        (!account.rate_limited_until || account.rate_limited_until < now)
    );
}
```
- Paused accounts are excluded
- Rate-limited accounts are excluded if their rate limit hasn't expired

### 3. Session Management
The SessionStrategy manages account sessions through the following process:

1. **Active Session Search**: Finds the account with the most recent active session
2. **Session Validation**: Checks if the session is within the configured duration
3. **Account Ordering**: Returns accounts in priority order:
   - Active session account (if available) comes first
   - Other available accounts follow as fallback options

### 4. Session Reset
Sessions are reset when:
- No active session exists
- The current session has expired
- A new account needs to be selected

```typescript
private resetSessionIfExpired(account: Account): void {
    const now = Date.now();
    
    if (!account.session_start || 
        now - account.session_start >= this.sessionDurationMs) {
        // Reset session via StrategyStore
        this.store.resetAccountSession(account.id, now);
        account.session_start = now;
        account.session_request_count = 0;
    }
}
```

### 5. Database Updates
The StrategyStore interface provides methods for session management:
- `resetAccountSession(accountId, timestamp)`: Resets session start time and request count
- `updateAccountRequestCount(accountId, count)`: Updates request count for an account
- `getAccount(accountId)`: Retrieves account information

## Performance Considerations

### Session-Based Performance

The session strategy provides excellent rate limit avoidance at the cost of potentially uneven load distribution:

- **Rate Limit Avoidance**: By maintaining sessions with individual accounts for extended periods, the strategy minimizes the risk of hitting rate limits due to rapid account switching.
- **Load Distribution**: Load may concentrate on fewer accounts during a session window. This is acceptable for most use cases but should be monitored.
- **Failover**: If the active session account becomes unavailable, the system automatically fails over to the next available account.

### Session Storage

Session information is stored directly in the database with the following fields:
- `session_start`: Timestamp when the current session began
- `session_request_count`: Number of requests in the current session
- `rate_limited_until`: Timestamp when rate limiting expires (if applicable)

These fields are updated synchronously to ensure consistency in account selection.

### Monitoring

Monitor these key metrics:
- Account usage distribution
- Rate limit occurrences
- Session duration effectiveness
- Failover frequency

## Important: Why Only Session-Based Strategy

**⚠️ WARNING: Only the session-based load balancer strategy is available in ccflare.**

Other strategies like round-robin, least-requests, or weighted distribution have been removed from the codebase as they can trigger Claude's anti-abuse systems and result in automatic account bans. Here's why they were removed:

### Account Ban Risks

1. **Rapid Account Switching**: Strategies that frequently switch between accounts create suspicious patterns that Claude's systems detect as potential abuse.

2. **Unnatural Usage Patterns**: Round-robin and similar strategies create artificial request patterns that don't match normal human usage.

3. **Rate Limit Triggering**: Frequent account switching increases the likelihood of hitting rate limits across multiple accounts simultaneously.

### Why Session-Based is Safe

The session-based strategy mimics natural user behavior:
- Maintains consistent sessions with individual accounts
- Reduces account switching to once every 5 hours (configurable)
- Creates usage patterns similar to a regular Claude user
- Minimizes the risk of triggering anti-abuse systems

### Best Practices

1. **Always use session-based strategy**: This is the only strategy that won't risk your accounts
2. **Configure appropriate session duration**: Default 5 hours is recommended
3. **Monitor account health**: Watch for any rate limit issues or warnings
4. **Avoid custom strategies**: Do not implement custom load balancing strategies unless you fully understand the risks

If you need different behavior, adjust the session duration rather than switching strategies:
```json
{
    "lb_strategy": "session",
    "session_duration_ms": 18000000  // 5 hours (recommended)
}
```

## LoadBalancingStrategy Interface

For reference, here's the interface that all load balancing strategies must implement:

```typescript
// From types/context.ts
export interface LoadBalancingStrategy {
    /**
     * Return a filtered & ordered list of candidate accounts.
     * Accounts that are rate-limited should be filtered out.
     * The first account in the list should be tried first.
     */
    select(accounts: Account[], meta: RequestMeta): Account[];

    /**
     * Optional initialization method to inject dependencies
     * Used for strategies that need access to a StrategyStore
     */
    initialize?(store: StrategyStore): void;
}
```

The `RequestMeta` object contains:
- `id`: Unique request identifier
- `method`: HTTP method
- `path`: Request path
- `timestamp`: Request timestamp
- `agentUsed`: Optional agent identifier

Currently, only the `SessionStrategy` implementation exists in the codebase at `/packages/load-balancer/src/strategies/index.ts`.