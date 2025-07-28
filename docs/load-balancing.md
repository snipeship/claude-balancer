# Load Balancing in ccflare

## Table of Contents
1. [Overview](#overview)
2. [Session-Based Strategy](#session-based-strategy)
3. [Configuration](#configuration)
4. [Performance Considerations](#performance-considerations)
5. [Important: Why Only Session-Based Strategy](#important-why-only-session-based-strategy)

## Overview

ccflare implements a session-based load balancing system to distribute requests across multiple Claude OAuth accounts, avoiding rate limits and ensuring high availability. The system maintains 5-hour sessions with individual accounts to minimize rate limit issues.

### Key Features
- **Account Health Monitoring**: Automatically filters out rate-limited or paused accounts
- **Failover Support**: Returns ordered lists of accounts for automatic failover
- **Session Persistence**: Maintains 5-hour sessions on specific accounts
- **Real-time Configuration**: Change settings without restarting the server
- **Async Database Operations**: Non-blocking database writes via AsyncDbWriter

## Session-Based Strategy

**Description**: Maintains sticky sessions with individual accounts for a configurable duration (default: 5 hours). This strategy minimizes account switching to reduce the likelihood of hitting rate limits.

**Use Case**: Optimal for production environments where minimizing rate limits is crucial. Particularly effective for applications with sustained user sessions.

**Implementation**:
```typescript
export class SessionStrategy implements LoadBalancingStrategy {
    private sessionDurationMs: number;
    private store: StrategyStore | null = null;
    private log = new Logger("SessionStrategy");

    constructor(sessionDurationMs: number = 5 * 60 * 60 * 1000) {
        this.sessionDurationMs = sessionDurationMs;
    }

    select(accounts: Account[], _meta: RequestMeta): Account[] {
        // Logic to maintain session with active account
        // Falls back to new account when session expires or account unavailable
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

### Environment Variables

```bash
# Load balancing strategy (only 'session' is supported)
LB_STRATEGY=session

# Session duration in milliseconds (default: 5 hours)
SESSION_DURATION_MS=18000000

# Server port
PORT=8080
```

### Configuration File

Create `~/.ccflare/config.json`:

```json
{
    "lb_strategy": "session",
    "session_duration_ms": 18000000,
    "port": 8080
}
```

### Dynamic Configuration

The strategy configuration can be changed at runtime via the HTTP API:

```bash
# Update configuration
curl -X PUT http://localhost:8080/api/config/strategy \
  -H "Content-Type: application/json" \
  -d '{"strategy": "session"}'

# Get current configuration
curl http://localhost:8080/api/config/strategy
```

## Performance Considerations

### Session-Based Performance

The session strategy provides excellent rate limit avoidance at the cost of potentially uneven load distribution:

- **Rate Limit Avoidance**: By maintaining sessions with individual accounts for extended periods, the strategy minimizes the risk of hitting rate limits due to rapid account switching.
- **Load Distribution**: Load may concentrate on fewer accounts during a session window. This is acceptable for most use cases but should be monitored.
- **Failover**: If the active session account becomes unavailable, the system automatically fails over to the next available account.

### Database Performance

All strategies use the `AsyncDbWriter` for non-blocking database operations:

```typescript
// Async write example - doesn't block request processing
asyncWriter.writeRequest({
    requestId,
    accountId: account.id,
    timestamp: Date.now(),
    // ... other fields
});
```

### Monitoring

Monitor these key metrics:
- Account usage distribution
- Rate limit occurrences
- Session duration effectiveness
- Failover frequency

## Important: Why Only Session-Based Strategy

**⚠️ WARNING: You should only use the session-based load balancer strategy.**

Other strategies like round-robin, least-requests, or weighted distribution can trigger Claude's anti-abuse systems and result in automatic account bans. Here's why:

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