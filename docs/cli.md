# ccflare CLI Documentation

The ccflare CLI provides a command-line interface for managing OAuth accounts, monitoring usage statistics, and controlling the load balancer.

## Table of Contents

- [Installation and Setup](#installation-and-setup)
- [Global Options and Help](#global-options-and-help)
- [Command Reference](#command-reference)
  - [Account Management](#account-management)
  - [Statistics and History](#statistics-and-history)
  - [System Commands](#system-commands)
- [Usage Examples](#usage-examples)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

## Installation and Setup

### Prerequisites

- Bun runtime (>= 1.2.8)
- Node.js compatible system

### Installation

1. Clone the repository:
```bash
git clone https://github.com/snipe-code/ccflare.git
cd ccflare
```

2. Install dependencies:
```bash
bun install
```

3. Run the CLI:
```bash
bun cli <command> [options]
```

### First-time Setup

1. Add your first OAuth account:
```bash
bun cli add myaccount
```

2. Start the load balancer server:
```bash
bun start
```

## Global Options and Help

### Getting Help

Display all available commands and options:

```bash
bun cli help
```

Or simply run without any command:

```bash
bun cli
```

### Help Output Format

```
Usage: ccflare-cli <command> [options]

Commands:
  add <name> [options]      Add a new account using OAuth
  list                      List all accounts with their details
  remove <name> [options]   Remove an account
  pause <name>              Pause an account
  resume <name>             Resume a paused account
  reset-stats               Reset request counts
  clear-history             Clear request history
  help                      Show help message
```

## Command Reference

### Account Management

#### `add <name>`

Add a new OAuth account to the load balancer pool.

**Syntax:**
```bash
bun cli add <name> [--mode <max|console>] [--tier <1|5|20>]
```

**Options:**
- `--mode`: Account type (optional)
  - `max`: Claude Max account
  - `console`: Console account
- `--tier`: Account tier (optional, Max accounts only)
  - `1`: Tier 1 account
  - `5`: Tier 5 account
  - `20`: Tier 20 account

**Interactive Flow:**
1. If mode not provided, prompts for account type selection
2. If tier not provided (Max accounts only), prompts for tier selection
3. Opens browser for OAuth authentication
4. Waits for OAuth callback on localhost:7856
5. Stores account credentials securely in the database

#### `list`

Display all configured accounts with their current status.

**Syntax:**
```bash
bun cli list
```

**Output Columns:**
- **Name**: Account identifier
- **Type**: Account provider (claude-max or claude-console)
- **Tier**: Account tier (1/5/20 for Max, N/A for Console)
- **Requests**: Current/Total request count
- **Token**: Token validity status
- **Status**: Rate limit status and timing
- **Session**: Session information and expiry

#### `remove <name>`

Remove an account from the configuration.

**Syntax:**
```bash
bun cli remove <name> [--force]
```

**Options:**
- `--force`: Skip confirmation prompt

**Behavior:**
- Prompts for confirmation unless `--force` is used
- Removes account from database
- Cleans up associated session data

#### `pause <name>`

Temporarily exclude an account from the load balancer rotation.

**Syntax:**
```bash
bun cli pause <name>
```

**Use Cases:**
- Account experiencing issues
- Manual rate limit management
- Maintenance or debugging

#### `resume <name>`

Re-enable a paused account for load balancing.

**Syntax:**
```bash
bun cli resume <name>
```

### Statistics and History

#### `reset-stats`

Reset request counters for all accounts.

**Syntax:**
```bash
bun cli reset-stats
```

**Effects:**
- Resets request counts to 0
- Preserves account configuration
- Does not affect rate limit timers

#### `clear-history`

Remove all request history records.

**Syntax:**
```bash
bun cli clear-history
```

**Effects:**
- Deletes request log entries
- Preserves account data
- Reports number of records cleared

### System Commands

#### Dashboard Access

The web dashboard runs as a separate service:

```bash
# Development mode with hot reload
bun dev:dashboard

# Or access through the running server
# Default: http://localhost:8080/_dashboard
```

#### Terminal UI (TUI)

Launch the interactive terminal interface:

```bash
# Run TUI directly
bun dev

# Or build and run
bun build:tui
bun run apps/tui/dist/main.js
```

## Usage Examples

### Basic Account Setup

```bash
# Add a Claude Max account with tier 5
bun cli add work-account --mode max --tier 5

# Add a Console account
bun cli add personal-account --mode console

# List all accounts
bun cli list

# Check specific account status
bun cli list | grep work-account
```

### Managing Rate Limits

```bash
# Pause account hitting rate limits
bun cli pause work-account

# Resume after cooldown
bun cli resume work-account

# Reset statistics for fresh start
bun cli reset-stats
```

### Maintenance Operations

```bash
# Remove old account with confirmation
bun cli remove old-account

# Force remove without confirmation
bun cli remove test-account --force

# Clear old request logs
bun cli clear-history
```

### Automation Examples

```bash
# Add multiple accounts via script
for i in {1..3}; do
  bun cli add "account-$i" --mode max --tier 5
done

# Monitor account status
watch -n 5 'bun cli list'

# Automated cleanup
bun cli clear-history && bun cli reset-stats
```

## Configuration

### Configuration File Location

ccflare stores its configuration in platform-specific directories:

#### macOS/Linux
```
~/.config/ccflare/ccflare.json
```

Or if `XDG_CONFIG_HOME` is set:
```
$XDG_CONFIG_HOME/ccflare/ccflare.json
```

#### Windows
```
%LOCALAPPDATA%\ccflare\ccflare.json
```

Or fallback to:
```
%APPDATA%\ccflare\ccflare.json
```

### Configuration Structure

```json
{
  "lb_strategy": "session",
  "client_id": "optional-custom-client-id",
  "retry_attempts": 3,
  "retry_delay_ms": 1000,
  "retry_backoff": 2,
  "session_duration_ms": 18000000,
  "port": 8080
}
```

### Database Location

The SQLite database follows the same directory structure:
- **macOS/Linux**: `~/.config/ccflare/ccflare.db`
- **Windows**: `%LOCALAPPDATA%\ccflare\ccflare.db`

## Environment Variables

### Core Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ccflare_CONFIG_PATH` | Override config file location | Platform default |
| `ccflare_DB_PATH` | Override database location | Platform default |
| `PORT` | Server port | 8080 |
| `CLIENT_ID` | OAuth client ID | 9d1c250a-e61b-44d9-88ed-5944d1962f5e |

### Load Balancing

| Variable | Description | Default |
|----------|-------------|---------|
| `LB_STRATEGY` | Load balancing strategy (only 'session' is supported) | session |

### Retry Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `RETRY_ATTEMPTS` | Number of retry attempts | 3 |
| `RETRY_DELAY_MS` | Initial retry delay (ms) | 1000 |
| `RETRY_BACKOFF` | Exponential backoff multiplier | 2 |

### Session Management

| Variable | Description | Default |
|----------|-------------|---------|
| `SESSION_DURATION_MS` | OAuth session duration (ms) | 18000000 (5 hours) |

### Logging and Debugging

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Log verbosity (DEBUG/INFO/WARN/ERROR) | INFO |
| `LOG_FORMAT` | Output format (pretty/json) | pretty |
| `ccflare_DEBUG` | Enable debug mode (1/0) - enables console output | 0 |

### Pricing and Features

| Variable | Description | Default |
|----------|-------------|---------|
| `CF_PRICING_REFRESH_HOURS` | Pricing cache duration | 24 |
| `CF_PRICING_OFFLINE` | Offline mode flag (1/0) | 0 |

## Troubleshooting

### Common Issues

#### OAuth Authentication Fails

**Problem**: Browser doesn't open or OAuth callback fails

**Solutions**:
1. Ensure default browser is configured
2. Check firewall settings for localhost:7856
3. Manually copy OAuth URL from terminal
4. Verify network connectivity

#### Account Shows as "Expired"

**Problem**: Token status shows expired

**Solutions**:
1. Remove and re-add the account
2. Check system time synchronization
3. Verify OAuth session hasn't exceeded 5-hour limit

#### Rate Limit Errors

**Problem**: Accounts hitting rate limits frequently

**Solutions**:
1. Add more accounts to the pool
2. Increase session duration for less frequent switching
3. Implement request throttling in client code
4. Monitor usage with `bun cli list`

#### Database Errors

**Problem**: "Database is locked" or corruption errors

**Solutions**:
1. Stop all ccflare processes
2. Check file permissions on database
3. Backup and recreate if corrupted:
   ```bash
   cp ~/.config/ccflare/ccflare.db ~/.config/ccflare/ccflare.db.backup
   rm ~/.config/ccflare/ccflare.db
   ```

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Enable debug logging
export ccflare_DEBUG=1
export LOG_LEVEL=DEBUG

# Run with verbose output
bun cli list
```

### Getting Support

1. Check existing documentation in `/docs`
2. Review debug logs for detailed error messages
3. Ensure all dependencies are up to date
4. File an issue with reproduction steps

### Best Practices

1. **Regular Maintenance**
   - Clear history periodically to manage database size
   - Reset stats monthly for accurate metrics
   - Monitor account health with regular `list` commands

2. **Account Management**
   - Use descriptive account names
   - Distribute load across multiple accounts
   - Keep accounts of similar tiers for consistent performance

3. **Security**
   - Protect configuration directory permissions
   - Don't share OAuth tokens or session data
   - Rotate accounts periodically

4. **Performance**
   - Use higher-tier accounts for heavy workloads
   - Implement client-side retry logic
   - Monitor rate limit patterns