# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with ccflare.

## Table of Contents

1. [OAuth Authentication Problems](#oauth-authentication-problems)
2. [Rate Limiting Issues](#rate-limiting-issues)
3. [Connection Problems](#connection-problems)
4. [Performance Issues](#performance-issues)
5. [Account Management Issues](#account-management-issues)
6. [Configuration Problems](#configuration-problems)
7. [Database Issues](#database-issues)
8. [Streaming and Analytics Issues](#streaming-and-analytics-issues)
9. [Logging and Debugging](#logging-and-debugging)
10. [Common Error Messages](#common-error-messages)
11. [Environment Variables Reference](#environment-variables-reference)
12. [FAQ](#faq)
13. [Getting Help](#getting-help)

## OAuth Authentication Problems

### Invalid Tokens

**Symptom**: Requests fail with 401 Unauthorized errors

**Error Message**: `Failed to refresh access token`

**Solutions**:
1. Check if the access token has expired:
   ```bash
   ccflare --list
   ```
   Look for accounts with expired tokens (expires_at in the past)

2. Refresh the token manually:
   - Remove and re-add the account:
     ```bash
     ccflare --remove <account-name>
     ccflare --add-account <account-name>
     ```

3. Verify the refresh token is still valid in your Anthropic console

### Expired Tokens

**Symptom**: Token refresh attempts fail repeatedly

**Error Message**: `Token expired or missing for account: [name]`

**Solutions**:
1. ccflare automatically attempts to refresh expired tokens
2. If automatic refresh fails, re-authenticate the account
3. Check for refresh token stampede prevention - multiple simultaneous refresh attempts are prevented

### PKCE Failures

**Symptom**: OAuth authorization fails during account setup

**Error Messages**:
- `Token exchange failed: [error]`
- `Invalid code_verifier`
- `Refresh promise not found for account`

**Solutions**:
1. Ensure you're using the complete authorization code including the state fragment (format: `code#state`)
2. Don't modify or truncate the authorization code
3. Complete the OAuth flow within the time limit (codes expire quickly)
4. Try the authorization flow again from the beginning
5. Ensure only one refresh attempt happens at a time (refresh stampede prevention is active)

### Token Refresh Failures

**Symptom**: Automatic token refresh fails

**Error Messages**:
- `Failed to refresh access token`
- `Token refresh failed: [error]`

**Solutions**:
1. Check if the refresh token was revoked in your Anthropic console
2. Verify the CLIENT_ID environment variable matches your OAuth app
3. Remove and re-add the account:
   ```bash
   ccflare --remove <account-name>
   ccflare --add-account <account-name>
   ```
4. Check for multiple simultaneous refresh attempts in logs

## Rate Limiting Issues

### Identifying Rate Limits

ccflare detects rate limits through response headers and HTTP status codes:

1. **Rate Limited Responses**: 
   - HTTP 429 responses
   - Rate limit headers in responses
   - Account is marked unavailable for selection

**How to Check Rate Limit Status**:
```bash
# View account status including rate limits
ccflare --list

# Check logs for rate limit messages
cat /tmp/ccflare-logs/app.log | grep "rate limited"

# View rate limit reset times in the dashboard
curl http://localhost:8080/api/accounts | jq '.[] | {name, rate_limit_status, rate_limit_reset}'
```

### Recovery Strategies

**When an account is rate-limited**:
1. ccflare automatically rotates to the next available account
2. Rate-limited accounts are marked with a reset timestamp
3. Accounts automatically become available again after the reset time

**Manual recovery steps**:
1. Add more accounts to your pool:
   ```bash
   ccflare --add-account account2
   ```

2. Check rate limit reset times in the dashboard:
   ```
   http://localhost:8080/dashboard
   ```

3. Monitor account-specific rate limits:
   ```bash
   # View rate limit details for each account
   ccflare --list
   # Look for rate_limit_status and rate_limit_reset columns
   ```

4. Pause/resume accounts as needed:
   ```bash
   ccflare --pause <account-name>
   ccflare --resume <account-name>
   ```

## Connection Problems

### Network Timeouts

**Symptom**: Requests hang or timeout

**Error Messages**:
- `ECONNREFUSED`
- `ETIMEDOUT`
- `Failed to forward unauthenticated request`
- `All accounts failed to proxy the request`

**Solutions**:
1. Check your internet connection
2. Verify the Anthropic API is accessible:
   ```bash
   curl -I https://api.anthropic.com/v1/messages
   ```
3. Check proxy settings if behind a corporate firewall
4. Increase retry configuration in config file

### Proxy Configuration

**Configuring HTTP proxy**:
```bash
# Set proxy environment variables before starting
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
bun start
```

**Bypass proxy for local requests**:
```bash
export NO_PROXY=localhost,127.0.0.1
```

## Performance Issues

### Slow Responses

**Symptoms**:
- High response times in logs
- Dashboard shows increased latency

**Solutions**:
1. Check account distribution:
   - Ensure accounts aren't all rate-limited
   - Verify load balancing strategy is appropriate

2. Optimize retry settings:
   ```json
   {
     "retry_attempts": 2,
     "retry_delay_ms": 500,
     "retry_backoff": 1.5
   }
   ```

3. Use session-based routing for conversational workloads:
   ```bash
   # Set strategy to session for better performance with conversations
   # Session is the default and only supported strategy
   ```

### High Memory Usage

**Symptom**: Process consuming excessive memory

**Solutions**:
1. Check log file size (auto-rotates at 10MB):
   ```bash
   ls -lh /tmp/ccflare-logs/app.log
   ```

2. Clear request history:
   ```bash
   ccflare --clear-history
   ```

3. Restart the server to clear in-memory caches:
   ```bash
   # Graceful shutdown with Ctrl+C
   # Then restart
   bun start
   # Or
   ccflare --serve
   ```

## Account Management Issues

### Account Not Being Used

**Symptom**: Specific account never receives requests

**Check**:
1. Account status:
   ```bash
   ccflare --list
   # Look for: paused, rate_limited, or expired
   ```

2. Session persistence:
   - Check if account has an active session
   - Verify session hasn't expired

**Solutions**:
1. Resume the account if paused:
   ```bash
   ccflare --resume <account-name>
   ```
2. Wait for rate limit to reset
3. Re-add the account if expired

### Account Selection Problems

**Symptom**: Uneven distribution of requests

**Solutions**:
1. Check current strategy:
   ```bash
   # Session strategy is the default and only supported strategy
   ```

2. Session strategy behavior:
   - `session`: Maintains 1-hour sessions with individual accounts (default: 3600000ms)
   - This is the only supported strategy to avoid account bans
   - Adjust session_duration_ms if needed

## Configuration Problems

### Config File Location

Default locations by platform:
- **macOS**: `~/.config/ccflare/ccflare.json`
- **Linux**: `~/.config/ccflare/ccflare.json`
- **Windows**: `%LOCALAPPDATA%\ccflare\ccflare.json` or `%APPDATA%\ccflare\ccflare.json`

### Invalid Configuration

**Symptom**: Server fails to start or uses default values

**Error Messages**:
- `Failed to parse config file`
- `Invalid strategy: [name]`

**Solutions**:
1. Validate JSON syntax:
   ```bash
   cat ~/.config/ccflare/ccflare.json | jq .
   ```

2. Reset to defaults:
   ```bash
   # Backup current config
   cp ~/.config/ccflare/ccflare.json ~/.config/ccflare/config.backup.json
   # Remove corrupted config
   rm ~/.config/ccflare/ccflare.json
   # Restart server to create new config
   bun start
   ```

### Environment Variable Override

Environment variables override config file settings:
- `CLIENT_ID`: OAuth client ID
- `PORT`: Server port (default: 8080)
- `LB_STRATEGY`: Load balancing strategy
- `RETRY_ATTEMPTS`: Number of retry attempts
- `RETRY_DELAY_MS`: Initial retry delay
- `SESSION_DURATION_MS`: Session duration for session strategy

## Database Issues

### Database Path Problems

**Symptom**: Server fails to start with database errors

**Error Messages**:
- `Database file not found`
- `Permission denied`
- `Cannot create database`

**Solutions**:
1. Check database file permissions:
   ```bash
   # macOS/Linux
   ls -la ~/.config/ccflare/ccflare.db
   
   # Windows
   dir %LOCALAPPDATA%\ccflare\ccflare.db
   ```

2. Create the directory if it doesn't exist:
   ```bash
   # macOS/Linux
   mkdir -p ~/.config/ccflare
   
   # Windows
   mkdir %LOCALAPPDATA%\ccflare
   ```

3. Use a custom database path:
   ```bash
   export ccflare_DB_PATH=/path/to/custom/ccflare.db
   bun start
   ```

### Database Migration Failures

**Symptom**: Server logs show migration errors

**Error Messages**:
- `ALTER TABLE failed`
- `Column already exists`
- `Migration failed`

**Solutions**:
1. The migration system is idempotent - errors about existing columns are harmless
2. If migrations fail repeatedly:
   ```bash
   # Backup existing database
   cp ~/.config/ccflare/ccflare.db ~/.config/ccflare/ccflare.db.backup
   
   # Remove and let it recreate
   rm ~/.config/ccflare/ccflare.db
   bun start
   ```

3. Check for database corruption:
   ```bash
   sqlite3 ~/.config/ccflare/ccflare.db "PRAGMA integrity_check;"
   ```

### Async Database Writer Issues

**Symptom**: Database writes appear delayed or missing

**Error Messages**:
- `Failed to execute DB job`
- `Async DB writer queue flushed`

**Solutions**:
1. The async writer batches writes every 100ms for performance
2. During shutdown, ensure graceful termination (Ctrl+C) to flush pending writes
3. Check logs for async writer errors:
   ```bash
   grep "async-db-writer" /tmp/ccflare-logs/app.log
   ```

### Database Lock Errors

**Symptom**: Multiple processes accessing the database

**Error Messages**:
- `database is locked`
- `SQLITE_BUSY`

**Solutions**:
1. Ensure only one instance of ccflare is running:
   ```bash
   ps aux | grep "bun start" | grep -v grep
   ps aux | grep "ccflare --serve" | grep -v grep
   ```

2. Kill any zombie processes:
   ```bash
   pkill -f "bun start"
   pkill -f "ccflare --serve"
   ```

3. Check for hanging database connections:
   ```bash
   lsof ~/.config/ccflare/ccflare.db
   ```

## Streaming and Analytics Issues

### Streaming Response Capture Problems

**Symptom**: Analytics data missing for streaming responses

**Error Messages**:
- `Stream tee error`
- `Failed to capture streaming response`
- `Buffer truncated at 1MB`

**Solutions**:
1. Streaming responses are captured up to 1MB for analytics
2. Large responses will be truncated but still forwarded completely to the client
3. Check if streaming is working:
   ```bash
   # Look for streaming response logs
   grep "Streaming response" /tmp/ccflare-logs/app.log
   ```

### Analytics Data Issues

**Symptom**: Dashboard shows incorrect or missing analytics

**Error Messages**:
- `Failed to fetch analytics data`
- `Analytics error:`

**Solutions**:
1. Check if requests are being recorded:
   ```bash
   # Count recent requests in database
   sqlite3 ~/.config/ccflare/ccflare.db "SELECT COUNT(*) FROM requests WHERE timestamp > strftime('%s', 'now', '-1 hour') * 1000;"
   ```

2. Verify analytics endpoint:
   ```bash
   # Test analytics API
   curl "http://localhost:8080/api/analytics?range=1h"
   ```

3. Clear and rebuild analytics data:
   ```bash
   ccflare --clear-history
   ```

4. Reset account statistics without clearing history:
   ```bash
   ccflare --reset-stats
   ```

### Usage Tracking Problems

**Symptom**: Token usage and costs not updating

**Solutions**:
1. Usage is extracted from response headers and streaming data
2. Check for usage extraction errors:
   ```bash
   grep "extractUsageInfo" /tmp/ccflare-logs/app.log
   ```

3. Verify model pricing data:
   ```bash
   # Pricing updates every 24 hours by default
   grep "Fetching latest pricing" /tmp/ccflare-logs/app.log
   ```

4. Force offline pricing mode:
   ```bash
   export CF_PRICING_OFFLINE=1
   bun start
   ```

## Logging and Debugging

### Log File Locations

Logs are stored in the system's temporary directory:
- **All platforms**: `/tmp/ccflare-logs/app.log`
- **Windows**: `%TEMP%\ccflare-logs\app.log`

### Enabling Debug Mode

**Method 1: Environment Variable**
```bash
export ccflare_DEBUG=1
export LOG_LEVEL=DEBUG
bun start
```

**Method 2: Verbose Logging**
```bash
# View real-time logs
tail -f /tmp/ccflare-logs/app.log
```

### Log Formats

**JSON Format** (for parsing):
```bash
export LOG_FORMAT=json
bun start
```

**Pretty Format** (default):
```
[2024-01-20T10:30:45.123Z] INFO: [Proxy] Request completed for account1: 200 in 1234ms
```

### Reading Logs

**Filter by log level**:
```bash
# View only errors
grep "ERROR" /tmp/ccflare-logs/app.log

# View warnings and errors
grep -E "WARN|ERROR" /tmp/ccflare-logs/app.log
```

**Filter by component**:
```bash
# View only proxy logs
grep "\[Proxy\]" /tmp/ccflare-logs/app.log

# View only server logs
grep "\[Server\]" /tmp/ccflare-logs/app.log
```

## Common Error Messages

### Authentication and Token Errors

#### "No active accounts available - forwarding request without authentication"
**Meaning**: All accounts are either paused, rate-limited, or expired

**Solution**: 
- Add new accounts or wait for rate limits to reset
- Check account status: `ccflare --list`
- Requests will be forwarded without authentication (may fail)

#### "Refresh promise not found for account"
**Meaning**: Internal error during token refresh process

**Solution**:
- Restart the server to clear refresh state
- Check for concurrent refresh attempts in logs

#### "Failed to refresh access token"
**Meaning**: OAuth refresh token is invalid or revoked

**Solution**:
- Remove and re-add the account
- Check if the OAuth app still has permissions in Anthropic console

### Request Processing Errors

#### "Provider cannot handle path"
**Meaning**: Request path doesn't match expected Anthropic API patterns

**Solution**: 
- Ensure requests are to `/v1/*` endpoints
- Check if you're using the correct base URL
- Valid paths: `/v1/messages`, `/v1/complete`, etc.

#### "All accounts failed to proxy the request"
**Meaning**: Every account attempted but all failed

**Response**:
```json
{
  "error": "All accounts failed to proxy the request",
  "attempts": 3,
  "lastError": "Error message here"
}
```

**Solutions**:
1. Check individual account errors in logs
2. Verify network connectivity
3. Ensure at least one account has valid credentials
4. Check for API outages

#### "Failed to forward unauthenticated request"
**Meaning**: Request forwarding without authentication failed

**Solutions**:
1. Check network connectivity
2. Verify Anthropic API is accessible
3. Check for proxy configuration issues
4. Look for timeout errors in logs

#### "Failed to proxy request with account"
**Meaning**: Error occurred while proxying with a specific account

**Solutions**:
1. Check the specific account's status
2. Look for token expiration or rate limits
3. Verify network connectivity

### Database Errors

#### "Failed to execute DB job"
**Meaning**: Async database write failed

**Solutions**:
1. Check disk space
2. Verify database file permissions
3. Look for detailed error in logs

#### "database is locked"
**Meaning**: Another process is accessing the database

**Solutions**:
1. Ensure only one ccflare instance is running
2. Kill any zombie processes
3. Wait for current operations to complete

### Analytics and Streaming Errors

#### "Stream tee error"
**Meaning**: Failed to capture streaming response for analytics

**Solutions**:
1. This doesn't affect the actual response to the client
2. Check for memory issues if frequent
3. Large responses may exceed 1MB capture limit

#### "Failed to fetch analytics data"
**Meaning**: Analytics query failed

**Solutions**:
1. Check if database is accessible
2. Verify time range parameters
3. Clear history if data is corrupted: `ccflare --clear-history`

### Configuration Errors

#### "Failed to parse config file"
**Meaning**: JSON syntax error in config file

**Solutions**:
1. Validate JSON syntax: `cat ~/.config/ccflare/ccflare.json | jq .`
2. Check for trailing commas or missing quotes
3. Reset to defaults by deleting config file

#### "Invalid strategy: [name]"
**Meaning**: Unknown load balancing strategy specified

**Solutions**:
1. Only valid strategy: `session`
2. Check spelling in config or environment variable
3. The default is already `session`

### HTTP Status Codes

#### 400 Bad Request
**Common Causes**:
- Invalid request format
- Missing required parameters
- Invalid account name or ID

#### 401 Unauthorized
**Common Causes**:
- Expired access token
- Invalid OAuth credentials
- No active accounts available

#### 403 Forbidden
**Common Causes**:
- Account doesn't have required permissions
- OAuth app restrictions

#### 429 Too Many Requests
**Common Causes**:
- Account rate limited
- All accounts exhausted
- Check rate limit headers for reset time

#### 500 Internal Server Error
**Common Causes**:
- Unexpected server error
- Database connection issues
- Check logs for stack trace

### Startup Errors

#### "Address already in use"
**Meaning**: Port is already occupied

**Solutions**:
1. Check if another instance is running: `lsof -i :8080`
2. Use a different port: `PORT=3000 bun start`
3. Kill the process using the port

#### "Cannot create database"
**Meaning**: Unable to create or access database file

**Solutions**:
1. Check directory permissions
2. Ensure parent directory exists
3. Use custom path: `export ccflare_DB_PATH=/custom/path/db.db`

## Environment Variables Reference

### Core Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CLIENT_ID` | OAuth client ID for Anthropic | None | `my-oauth-client-id` |
| `PORT` | Server port | 8080 | `3000` |
| `LB_STRATEGY` | Load balancing strategy | `session` | Only `session` is supported |
| `RETRY_ATTEMPTS` | Number of retry attempts | 3 | `5` |
| `RETRY_DELAY_MS` | Initial retry delay in ms | 1000 | `500` |
| `RETRY_BACKOFF` | Retry backoff multiplier | 2 | `1.5` |
| `SESSION_DURATION_MS` | Session duration for session strategy | 3600000 (1 hour) | `1800000` |

### Paths and Storage

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ccflare_CONFIG_PATH` | Custom config file location | Platform-specific | `/opt/ccflare/config.json` |
| `ccflare_DB_PATH` | Custom database location | Platform-specific | `/opt/ccflare/data.db` |

### Logging and Debugging

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ccflare_DEBUG` | Enable debug mode | `0` | `1` |
| `LOG_LEVEL` | Log level | `INFO` | `DEBUG`, `WARN`, `ERROR` |
| `LOG_FORMAT` | Log format | `pretty` | `json` |

### Proxy Settings

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `HTTP_PROXY` | HTTP proxy URL | None | `http://proxy.company.com:8080` |
| `HTTPS_PROXY` | HTTPS proxy URL | None | `http://proxy.company.com:8080` |
| `NO_PROXY` | Bypass proxy for hosts | None | `localhost,127.0.0.1` |

### Advanced Settings

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CF_PRICING_OFFLINE` | Use offline pricing data | `0` | `1` |
| `CF_PRICING_REFRESH_HOURS` | Hours between pricing updates | `24` | `12` |

### Usage Examples

```bash
# Development setup with debug logging
export ccflare_DEBUG=1
export LOG_LEVEL=DEBUG
export LOG_FORMAT=json
bun start

# Production setup with custom paths
export ccflare_CONFIG_PATH=/etc/ccflare/config.json
export ccflare_DB_PATH=/var/lib/ccflare/data.db
export PORT=3000
bun start

# Corporate proxy setup
export HTTP_PROXY=http://proxy.corp.com:8080
export HTTPS_PROXY=http://proxy.corp.com:8080
export NO_PROXY=localhost,127.0.0.1,internal.corp.com
bun start
```

## FAQ

### Q: How do I know if ccflare is working?

**A**: Check the health endpoint:
```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "accounts": {
    "total": 3,
    "active": 2,
    "paused": 1
  },
  "uptime": 3600000
}
```

### Q: Can I use ccflare with multiple client applications?

**A**: Yes, ccflare acts as a transparent proxy. Point any Claude API client to `http://localhost:8080` instead of `https://api.anthropic.com`.

### Q: How do I backup my accounts?

**A**: The account data is stored in the SQLite database. Backup locations:
- **macOS/Linux**: `~/.config/ccflare/ccflare.db`
- **Windows**: `%LOCALAPPDATA%\ccflare\ccflare.db` or `%APPDATA%\ccflare\ccflare.db`

### Q: What happens during a graceful shutdown?

**A**: When receiving SIGINT (Ctrl+C) or SIGTERM:
1. Stops accepting new requests
2. Waits for in-flight requests to complete (with timeout)
3. Flushes async database writer queue
4. Closes database connections
5. Flushes logs to disk
6. Exits cleanly

### Q: How do I migrate to a new machine?

**A**: Copy these files to the new machine:
1. Database file (`ccflare.db`)
2. Config file (`ccflare.json`)
3. Set the same CLIENT_ID environment variable
4. Ensure Bun is installed on the new machine

### Q: Why is my analytics data missing or incorrect?

**A**: Several reasons can cause analytics issues:
1. Streaming responses are only captured up to 1MB
2. Database writes are async and may be delayed
3. Usage data depends on response headers from Anthropic
4. Check if requests are being recorded: `sqlite3 ~/.config/ccflare/ccflare.db "SELECT COUNT(*) FROM requests;"`

### Q: How do I handle rate limits effectively?

**A**: Best practices for rate limit handling:
1. Add multiple accounts to your pool
2. Maintain proper session duration (default 1 hour)
3. Monitor rate limit warnings in logs
4. Set up alerts for rate-limited accounts
5. Consider implementing request queuing in your application

### Q: Can I use ccflare in production?

**A**: Yes, with these considerations:
1. Use environment variables for sensitive configuration
2. Set up proper logging and monitoring
3. Use a persistent database path (not /tmp)
4. Configure appropriate retry settings
5. Add sufficient accounts for your load
6. Use systemd or similar for process management

### Q: Why are some accounts not being used?

**A**: Accounts may be skipped for several reasons:
1. **Paused**: Manually paused via CLI
2. **Rate Limited**: Temporarily unavailable due to rate limits
3. **Expired Token**: Needs re-authentication
4. **Session**: Account may have an active session
5. Check status: `ccflare --list`

### Q: How do I troubleshoot slow responses?

**A**: Steps to diagnose performance issues:
1. Check response times in logs or analytics
2. Verify no accounts are rate limited
3. Look for retry attempts in logs
4. Consider session duration settings
5. Check network latency to Anthropic API
6. Monitor database performance

### Q: What's the difference between running with bun start vs ccflare --serve?

**A**: Both commands start the server:
- `bun start`: Runs the server using the npm script
- `ccflare --serve`: Runs the server directly via the CLI binary
- Both are functionally equivalent

## Getting Help

### Reporting Bugs

When reporting issues, include:

1. **System Information**:
   ```bash
   bun --version
   node --version
   echo $OSTYPE
   ```

2. **Error Logs**:
   ```bash
   # Last 100 lines of logs
   tail -n 100 /tmp/ccflare-logs/app.log
   ```

3. **Configuration** (sanitized):
   ```bash
   # Remove sensitive data before sharing
   cat ~/.config/ccflare/ccflare.json | jq 'del(.client_id)'
   ```

4. **Steps to Reproduce**:
   - Exact commands run
   - Expected behavior
   - Actual behavior

### Debug Information Script

Save this as `debug-info.sh`:
```bash
#!/bin/bash
echo "=== ccflare Debug Info ==="
echo "Date: $(date)"
echo "System: $(uname -a)"
echo "Bun Version: $(bun --version)"
echo "Node Version: $(node --version 2>/dev/null || echo 'Node not installed')"
echo ""

echo "=== Environment Variables ==="
env | grep -E "ccflare|CLIENT_ID|PORT|LB_STRATEGY|LOG_|PROXY" | sort
echo ""

echo "=== Process Info ==="
ps aux | grep -E "bun start|ccflare" | grep -v grep
echo ""

echo "=== Port Check ==="
lsof -i :${PORT:-8080} 2>/dev/null || echo "Port ${PORT:-8080} not in use"
echo ""

echo "=== Database Info ==="
if [ -f "$HOME/.config/ccflare/ccflare.db" ]; then
    echo "Database size: $(du -h "$HOME/.config/ccflare/ccflare.db" | cut -f1)"
    echo "Request count: $(sqlite3 "$HOME/.config/ccflare/ccflare.db" "SELECT COUNT(*) FROM requests;" 2>/dev/null || echo "Could not query")"
    echo "Account count: $(sqlite3 "$HOME/.config/ccflare/ccflare.db" "SELECT COUNT(*) FROM accounts;" 2>/dev/null || echo "Could not query")"
else
    echo "Database not found at default location"
fi
echo ""

echo "=== Recent Errors (last 24h) ==="
if [ -f "/tmp/ccflare-logs/app.log" ]; then
    grep "ERROR" /tmp/ccflare-logs/app.log | tail -20
else
    echo "Log file not found"
fi
echo ""

echo "=== Recent Rate Limits ==="
if [ -f "/tmp/ccflare-logs/app.log" ]; then
    grep -E "rate.?limit" /tmp/ccflare-logs/app.log | tail -10
else
    echo "Log file not found"
fi
echo ""

echo "=== Account Status ==="
ccflare --list 2>/dev/null || echo "Could not get account list"
echo ""

echo "=== API Health Check ==="
curl -s http://localhost:${PORT:-8080}/health | jq . 2>/dev/null || echo "Health check failed"
echo ""

echo "=== Recent Analytics (1h) ==="
curl -s "http://localhost:${PORT:-8080}/api/analytics?range=1h" | jq '.overview' 2>/dev/null || echo "Analytics unavailable"
```

Make the script executable:
```bash
chmod +x debug-info.sh
./debug-info.sh > debug-report.txt
```

### Community Support

- Check existing issues in the repository
- Review this troubleshooting guide
- Search logs for specific error messages
- Try running in debug mode for more details

### Performance Monitoring

Monitor key metrics via the dashboard API:
```bash
# Get current stats
curl http://localhost:8080/api/stats | jq .

# Get request history with filters
curl "http://localhost:8080/api/requests?limit=10&status=error" | jq .

# Get analytics with time ranges
curl "http://localhost:8080/api/analytics?range=1h" | jq .
curl "http://localhost:8080/api/analytics?range=24h" | jq .
curl "http://localhost:8080/api/analytics?range=7d" | jq .

# Get analytics with filters
curl "http://localhost:8080/api/analytics?range=1h&model=claude-3-opus&status=success" | jq .

# Monitor real-time logs
tail -f /tmp/ccflare-logs/app.log | grep -E "INFO|WARN|ERROR"
```

### Quick Troubleshooting Checklist

When experiencing issues, check these in order:

1. **Service Health**
   ```bash
   curl http://localhost:8080/health
   ```

2. **Account Status**
   ```bash
   ccflare --list
   ```

3. **Recent Errors**
   ```bash
   grep ERROR /tmp/ccflare-logs/app.log | tail -20
   ```

4. **Rate Limits**
   ```bash
   grep "rate.?limit" /tmp/ccflare-logs/app.log | tail -10
   ```

5. **Network Connectivity**
   ```bash
   curl -I https://api.anthropic.com/v1/messages
   ```

6. **Database Health**
   ```bash
   sqlite3 ~/.config/ccflare/ccflare.db "PRAGMA integrity_check;"
   ```

### Common Quick Fixes

| Problem | Quick Fix |
|---------|-----------|
| All accounts rate limited | Add more accounts: `ccflare --add-account newaccount` |
| Token expired | Re-authenticate: `ccflare --remove account && ccflare --add-account account` |
| Database locked | Kill duplicate processes: `pkill -f "bun start"` |
| Port in use | Use different port: `PORT=3000 bun start` |
| Config corrupted | Reset config: `rm ~/.config/ccflare/ccflare.json` |
| Analytics missing | Clear history: `ccflare --clear-history` |
| Slow responses | Check session duration settings (default 1 hour) |

Remember: Most issues can be resolved by checking logs, verifying account status, and ensuring proper network connectivity. When in doubt, restart the service with debug logging enabled: `ccflare_DEBUG=1 LOG_LEVEL=DEBUG bun start`