# ccflare TUI Documentation

## Overview

The ccflare Terminal User Interface (TUI) provides an interactive way to manage your Claude API load balancer. Built with React and Ink, it offers real-time monitoring, account management, and comprehensive analytics all from your terminal.

### Key Features

- **Interactive Navigation**: Menu-driven interface with intuitive keyboard shortcuts
- **Real-time Updates**: Live monitoring of requests, logs, and statistics
- **Account Management**: Add, remove, and monitor OAuth accounts with PKCE flow
- **Request History**: View detailed request/response information with token usage
- **Statistics Dashboard**: Track usage, costs, token metrics, and performance
- **Log Streaming**: Real-time log viewer with pause/resume and historical logs
- **Auto-start Server**: The API server starts automatically when launching the TUI
- **Graceful Shutdown**: Proper cleanup of resources on exit

## Installation and Launching

### Prerequisites

- Bun runtime (v1.2.8 or higher)
- ccflare project dependencies installed
- Terminal with 256-color support (recommended)
- Minimum terminal size: 80x24

### Launching the TUI

There are two ways to launch the TUI:

```bash
# Using the package.json script (recommended)
bun run dev

# Direct execution
bun run apps/tui/src/main.ts
```

The TUI will automatically start the API server on port 8080 (or your configured port) when launched.

### Command Line Options

The TUI supports both interactive and non-interactive command line operations:

```bash
# Show help
bun run dev --help
bun run dev -h

# Start server only (no TUI)
bun run dev --serve [--port 8080]

# View logs  
bun run dev --logs [N]  # Stream logs (optionally show last N lines first)

# View statistics (JSON output)
bun run dev --stats

# Account management
bun run dev --add-account <name> [--mode max|console] [--tier 1|5|20]
bun run dev --list
bun run dev --remove <name>

# Maintenance
bun run dev --reset-stats
bun run dev --clear-history
```

## Navigation and Keyboard Shortcuts

### Global Navigation

- **Arrow Keys (↑/↓)**: Navigate through menu items in SelectInput components
- **Enter**: Select the highlighted option
- **ESC**: Go back to the previous screen or cancel operations
- **q**: Quit the current screen (works in list/view screens)
- **Ctrl+C**: Force quit the TUI from any screen

### Screen-Specific Shortcuts

#### Home Screen
- Use arrow keys to navigate the main menu
- Press Enter to select an option
- Select "Exit" or press Ctrl+C to quit the TUI

#### Server Status Screen
- **d**: Open the web dashboard in your default browser (uses the `open` package)
- **q/ESC**: Return to home screen

#### Accounts Management Screen
- **Enter**: Select an account to remove or select "Add Account"
- **ESC**: Cancel current operation or go back
- During account addition:
  - Type account name and press Enter
  - Use arrow keys to select mode (max/console)
  - Use arrow keys to select tier (1/5/20)
  - Browser opens automatically for OAuth
  - Type authorization code and press Enter

#### Request History Screen
- **↑/↓**: Navigate through requests (shows latest 15 with pagination indicator)
- **Enter/Space**: View detailed information for selected request
- **r**: Manually refresh the request list
- **q/ESC**: Go back (or exit details view if open)
- Auto-refreshes every 10 seconds

#### Statistics Dashboard Screen
- **r**: Manually refresh statistics
- **q/ESC**: Return to home screen
- Auto-refreshes every 5 seconds
- Shows token usage breakdown (input, cache read, cache creation, output)
- Displays total cost in USD

#### Logs Viewer Screen
- **Space**: Pause/resume log streaming
- **c**: Clear the current log display
- **q/ESC**: Return to home screen
- Loads last 200 historical logs on startup
- Maintains a buffer of 200 logs maximum

## Screen Descriptions

### 1. Home Screen

The main menu presents all available options using Ink's SelectInput component:

```
🎯 ccflare TUI

Select an option:
  🚀 Server
  👥 Manage Accounts
  📊 View Statistics
  📜 View Requests
  📋 View Logs
  ❌ Exit
```

### 2. Server Status Screen

Shows the auto-started server status and provides quick access to the web dashboard:

```
🚀 Server

✓ Server running at http://localhost:8080

Press 'd' to open dashboard in browser

Press 'q' or ESC to go back
```

The server is automatically started when the TUI launches and cleaned up on exit.

### 3. Accounts Management Screen

Manage your OAuth accounts with an interactive interface:

```
👥 Manage Accounts

2 account(s) configured

  work-account (tier 5)
  personal (tier 1)
  ➕ Add Account
  ← Back
```

#### Adding an Account

The add account flow uses PKCE OAuth and guides you through:
1. **Account Name**: Enter a unique identifier using TextInput
2. **Mode Selection**: Choose between "Max (recommended)" or "Console" using SelectInput
3. **Tier Selection**: Select "Tier 1 (default)", "Tier 5", or "Tier 20"
4. **OAuth Authentication**: Browser opens automatically with PKCE flow
5. **Code Entry**: Enter the authorization code after authentication

```
Complete Authentication

A browser window should have opened for authentication.
After authorizing, enter the code below:

Authorization code: [input field]

Press ESC to cancel
```

#### Removing an Account

Safety confirmation required - type the exact account name to confirm deletion:

```
⚠️ Confirm Account Removal

You are about to remove account 'work-account'.
This action cannot be undone.

Type work-account to confirm: [input field]

Press ENTER to confirm, ESC to cancel
```

### 4. Request History Screen

View recent API requests with detailed information:

```
📜 Request History
Use ↑/↓ to navigate, ENTER to view details

▶ 10:23:45 - 200 - work-acc... 
  10:23:44 - 429 - personal... [RATE LIMITED]
  10:23:43 - 200 - work-acc...
  10:23:42 - ERROR - personal... - Connection timeout...

... and 35 more requests

Press 'r' to refresh • 'q' or ESC to go back
```

The screen displays the latest 15 requests with:
- Timestamp (local time)
- Status code with color coding (green: 2xx, yellow: 4xx, red: 5xx/errors)
- Account ID (truncated to 8 characters)
- Rate limit indicators
- Error messages (truncated to 30 characters)

#### Detail View

Press Enter or Space on a request to see:

```
📜 Request Details

ID: req_abc123...
Time: 10:23:45 AM
Account: work-account
Retry: 1
Rate Limited

Request Headers:
  content-type: application/json
  authorization: Bearer sk-ant-...

Request Body:
{"model": "claude-3-opus-20240229", "messages": [...]}...

Response Status: 200

Response Body:
{"id": "msg_123...", "content": [...]}...

Press 'q' or ESC to go back
```

### 5. Statistics Dashboard Screen

Real-time statistics with automatic updates every 5 seconds:

```
📊 Statistics

Overall Stats
  Total Requests: 1,245
  Success Rate: 98.5%
  Active Accounts: 2
  Avg Response Time: 234ms
  Total Tokens: 1,234,567
    ├─ Input: 234,567
    ├─ Cache Read: 12,345
    ├─ Cache Creation: 1,234
    └─ Output: 123,456
  Total Cost: $12.45

Account Usage
  work-account: 845 requests (99% success)
  personal: 400 requests (97% success)

Recent Errors
  Failed to refresh token for expired-account
  Connection timeout after 30s
  Rate limit exceeded for account personal

Press 'r' to refresh • 'q' or ESC to go back
```

Features:
- Auto-refreshes every 5 seconds
- Shows detailed token usage breakdown (only non-zero values)
- Displays total cost in USD with 2 decimal precision
- Lists up to 5 recent errors
- Account-specific request counts and success rates

### 6. Logs Viewer Screen

Stream logs with pause and clear capabilities:

```
📜 Logs

[INFO] Request received from 127.0.0.1
[INFO] Using account: work-account
[WARN] Rate limit approaching for personal
[ERROR] Failed to refresh token for expired-account
[INFO] Request completed in 234ms

SPACE: Pause • 'c': Clear • 'q'/ESC: Back
```

When paused, the header shows:
```
📜 Logs (PAUSED)
```

Features:
- Loads historical logs on startup (shows "Loading logs..." initially)
- Maintains a rolling buffer of 200 log entries
- Real-time streaming when not paused
- Color-coded log levels:
  - ERROR: red
  - WARN: yellow
  - INFO: green
  - DEBUG: gray
- Space bar toggles pause/resume
- Clear function empties the current display

## Interactive Features

### Account OAuth Flow (PKCE)

The TUI uses PKCE (Proof Key for Code Exchange) for secure OAuth authentication:

1. Select "Add Account" from the Accounts screen
2. Enter a unique account name using the text input
3. Choose the mode using SelectInput:
   - **Max (recommended)**: Full Claude API access
   - **Console**: Limited console access
4. Select the tier based on your subscription (1, 5, or 20)
5. Browser opens automatically with PKCE parameters
6. Complete the authorization in your browser
7. Return to the TUI and enter the authorization code
8. Account is validated and added to the database

### Real-time Updates

- **Statistics**: Auto-refreshes every 5 seconds
- **Logs**: Streams in real-time (pauseable with Space)
- **Requests**: Auto-refreshes every 10 seconds (manual with 'r')
- **Account Status**: Updates when accounts are added/removed

## Color Coding and Indicators

### Status Colors

- **Green**: Success (2xx status), healthy, running, INFO logs
- **Yellow**: Warning, client errors (4xx), WARN logs
- **Red**: Error, server errors (5xx), failures, ERROR logs
- **Orange**: Rate limited (429 status)
- **Cyan**: Selected items, headers, TUI branding
- **Gray/Dim**: Supplementary information, DEBUG logs
- **Inverse**: Currently highlighted menu item

### Status Indicators

- **✓**: Success or server running
- **⚠️**: Warning or confirmation required
- **▶**: Currently selected item in lists
- **├─ └─**: Tree structure for token breakdown
- **[RATE LIMITED]**: Account hit rate limits
- **[PAUSED]**: Log streaming is paused
- **...**: Truncated content or more items available

## Tips and Tricks

### Performance Optimization

1. **Pause logs** when not actively monitoring to reduce CPU usage (Space key)
2. **Clear logs** periodically to free memory with 'c' key
3. **Auto-refresh intervals** are optimized (5s for stats, 10s for requests)
4. **200-log buffer** prevents excessive memory usage

### Account Management Best Practices

1. **Name accounts meaningfully**: Use descriptive names like "work-production" or "personal-dev"
2. **Monitor rate limits**: Check Statistics screen for account-specific success rates
3. **Distribute load**: Add multiple accounts to improve throughput
4. **PKCE OAuth**: More secure than standard OAuth flow
5. **Tier selection**: Choose the appropriate tier for your subscription level

### Troubleshooting

1. **TUI not responding**: Press ESC to go back, Ctrl+C to force quit
2. **Server already running**: The TUI auto-starts the server; check for existing processes
3. **OAuth issues**: Ensure browser allows pop-ups; check authorization code carefully
4. **Account removal**: Must type exact account name for safety
5. **Performance issues**: Pause log streaming or clear buffer

### Advanced Usage

1. **Multiple instances**: Use `--port` flag to run on different ports
2. **Headless operation**: Use CLI flags for CI/CD integration
3. **JSON output**: `--stats` flag outputs machine-readable statistics
4. **Direct server**: Use `--serve` to run server without TUI
5. **Batch operations**: Chain commands with `&&` in scripts

## Integration with CI/CD

The TUI's command-line interface is designed for automation:

```bash
# Add account in CI/CD pipeline
bun run dev --add-account ci-account --mode max --tier 5

# Check statistics programmatically
STATS=$(bun run dev --stats)
REQUESTS=$(echo $STATS | jq '.totalRequests')
SUCCESS_RATE=$(echo $STATS | jq '.successRate')

# Monitor logs in background
bun run dev --logs 100 | grep ERROR > error.log &

# Start server without TUI
bun run dev --serve --port 8081

# Maintenance tasks
bun run dev --reset-stats
bun run dev --clear-history
```

## Architecture Notes

- **Built with Ink**: React-based terminal UI framework
- **Dependency Injection**: Uses @ccflare/core-di for service management
- **Database**: SQLite-based storage with DatabaseFactory singleton
- **Async Operations**: AsyncDbWriter for non-blocking database operations
- **Graceful Shutdown**: Proper cleanup of resources and server on exit

## Known Limitations

1. **Terminal Requirements**: 
   - Minimum 80x24 terminal size
   - Best with 256-color support
   - May have issues in some Windows terminals
2. **Interactive Components**:
   - SelectInput requires arrow key support
   - TextInput may conflict with some terminal multiplexers
3. **Concurrent Access**: 
   - TUI is designed for single-user access
   - Database operations are synchronized
4. **Browser Integration**:
   - OAuth flow requires browser access
   - Dashboard opening depends on system default browser

## Troubleshooting Common Issues

### TUI Won't Start

```bash
# Check if port is in use
lsof -i :8080

# Kill existing process if needed
kill -9 <PID>

# Start with different port
bun run dev --port 8081
```

### Account Authentication Fails

1. Check browser allows pop-ups for OAuth
2. Ensure you're logged into Claude
3. Verify PKCE flow completed successfully
4. Check authorization code is entered correctly
5. Try removing and re-adding the account

### Performance Issues

1. Pause log streaming with Space key
2. Clear log buffer with 'c' key
3. Check terminal emulator performance settings
4. Ensure adequate system resources

### Data Issues

1. Use `--reset-stats` to clear statistics
2. Use `--clear-history` to remove old requests
3. Check database file permissions
4. Verify disk space availability

## Recent Changes

- **PKCE OAuth**: Enhanced security for account authentication
- **Token Metrics**: Detailed token usage and cost tracking
- **Async Database**: Improved performance with AsyncDbWriter
- **Historical Logs**: Load previous logs on startup
- **Account Confirmation**: Safety dialog for account removal
- **Graceful Shutdown**: Proper cleanup on exit

## Support

For issues or feature requests:
- Check the error messages in the logs screen
- Review this documentation
- Submit issues to the GitHub repository
- Ensure you're running the latest version