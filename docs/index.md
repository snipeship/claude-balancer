# ccflare Documentation

## Track Every Request. Go Low-Level. Never Hit Rate Limits Again.

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.2.8-f472b6)

## Overview

ccflare is the ultimate Claude API proxy with intelligent load balancing across multiple accounts. Built with TypeScript and Bun runtime, it provides full visibility into every request, response, and rate limit, ensuring your AI applications never experience downtime due to rate limiting.

### Why ccflare?

When working with Claude API at scale, rate limits can become a significant bottleneck. ccflare solves this by:

- **🚀 Zero Rate Limit Errors**: Automatically distributes requests across multiple accounts with intelligent failover
- **📊 Request-Level Analytics**: Track latency, token usage, and costs in real-time with <10ms overhead
- **🔍 Deep Debugging**: Full request/response logging and error traces for complete visibility
- **💸 Session-Based Routing**: Default 5-hour sessions maximize prompt cache efficiency, reducing costs
- **⚡ Production Ready**: Built for scale with SQLite persistence, OAuth token refresh, and configurable retry logic

## Key Features

### 🎯 Intelligent Load Balancing
- **Session-based** (only supported strategy): Maintains conversation context with 5-hour sessions to avoid rate limits and account bans
- **⚠️ WARNING**: Other strategies (round-robin, least-requests, weighted) have been removed as they can trigger Claude's anti-abuse systems

### 📈 Real-Time Monitoring & Analytics
- **Web Dashboard**: Interactive UI at `/dashboard` with live metrics
- **Terminal UI**: Built-in TUI for server management and monitoring
- **Request Tracking**: Complete history with token usage and costs
- **Performance Metrics**: Response times, success rates, and error tracking

### 🛠️ Developer Experience
- **Zero Config Proxy**: Drop-in replacement for Claude API
- **CLI Management**: Add, remove, and manage accounts easily
- **Automatic Failover**: Seamless switching on rate limits
- **OAuth Token Refresh**: Handles authentication automatically

### 🏗️ Production Ready
- **SQLite Persistence**: Reliable data storage with migrations
- **Configurable Retry Logic**: Smart exponential backoff
- **Account Tiers**: Support for Pro (1x), Max 5x, and Max 20x
- **Extensible Architecture**: Provider-based design for future AI services

## Documentation

### Getting Started
- [Configuration Guide](./configuration.md) - Environment variables and configuration options
- [Architecture Overview](./architecture.md) - System components and design principles
- [Data Flow](./data-flow.md) - Request lifecycle through the system

### Core Features
- [Load Balancing Strategy](./load-balancing.md) - Session-based strategy for safe account usage
- [Provider System](./providers.md) - Provider abstraction and OAuth implementation
- [Database Schema](./database.md) - SQLite structure, migrations, and maintenance

### User Interfaces
- [HTTP API Reference](./api-http.md) - Complete REST API documentation
- [CLI Commands](./cli.md) - Command-line interface reference
- [Terminal UI Guide](./tui.md) - Interactive terminal interface documentation

### Operations
- [Deployment Guide](./deployment.md) - Production deployment with Docker, systemd, PM2, and Kubernetes
- [Security Considerations](./security.md) - Authentication, encryption, and best practices
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [Contributing](./contributing.md) - Development setup and contribution guidelines

## Quick Start

### 1. Install ccflare

```bash
# Clone the repository
git clone https://github.com/snipeship/ccflare.git
cd ccflare

# Install dependencies
bun install
```

### 2. Start ccflare (TUI + Server)

```bash
# Start ccflare with interactive TUI and server
bun run ccflare

# Or start just the server without TUI
bun run server

# Specify session duration (default: 5 hours)
SESSION_DURATION_MS=21600000 bun run server  # 6 hours
```

### 3. Add Your Claude Accounts

```bash
# In another terminal, add your accounts
# Add a work account
bun cli add work-account

# Add a personal account
bun cli add personal-account

# Add accounts with specific tiers
bun cli add pro-account --mode max --tier 1
bun cli add max-account --mode max --tier 5
```

### 4. Configure Your Claude Client

```bash
# Set the base URL to use ccflare
export ANTHROPIC_BASE_URL=http://localhost:8080
```

### 5. Monitor Your Usage

- **Web Dashboard**: Open [http://localhost:8080/dashboard](http://localhost:8080/dashboard) for real-time analytics
- **Terminal UI**: Use the interactive TUI started with `bun run ccflare`
- **CLI**: Check status with `bun cli list`

## Project Structure

```
ccflare/
├── apps/               # Application packages
│   ├── cli/           # Command-line interface
│   ├── server/        # Main proxy server
│   ├── tui/           # Terminal UI interface
│   └── lander/        # Landing page
├── packages/          # Core packages
│   ├── core/          # Core business logic
│   ├── database/      # SQLite database layer
│   ├── dashboard-web/ # Web dashboard UI
│   ├── http-api/      # REST API handlers
│   ├── load-balancer/ # Load balancing strategies
│   ├── logger/        # Logging utilities
│   ├── providers/     # OAuth provider system
│   └── proxy/         # HTTP proxy implementation
└── docs/              # Documentation

```

## Scripts Reference

```bash
# Main commands
bun run ccflare    # Start TUI + Server
bun run server         # Start server only
bun run tui            # Start TUI only
bun run cli            # Run CLI commands

# Development
bun run dev:server     # Server with hot reload
bun run dev:dashboard  # Dashboard development
bun run dev:cli        # CLI development

# Build & Quality
bun run build          # Build all packages
bun run typecheck      # Check TypeScript types
bun run lint           # Fix linting issues
bun run format         # Format code
```

## Environment Variables

```bash
# Server Configuration
PORT=8080                    # Server port (default: 8080)
LB_STRATEGY=session         # Load balancing strategy
SESSION_DURATION=18000000   # Session duration in ms (default: 5 hours)

# Development
LOG_LEVEL=info              # Logging level (debug|info|warn|error)
NODE_ENV=production         # Environment mode
```

## Related Resources

### External Links
- [Claude API Documentation](https://docs.anthropic.com/claude/docs) - Official Anthropic API docs
- [Bun Documentation](https://bun.sh/docs) - Bun runtime documentation
- [SQLite Documentation](https://www.sqlite.org/docs.html) - SQLite database docs

### Support
- [GitHub Repository](https://github.com/snipeship/ccflare) - Source code and issues
- [Contributing](./contributing.md) - How to contribute to ccflare

## License

ccflare is open source software licensed under the MIT License. See the [LICENSE](../LICENSE) file for details.

---

<div align="center">
  <p>Built with ❤️ for developers who ship</p>
  <p>
    <a href="#quick-start">Get Started</a> •
    <a href="./architecture.md">Learn More</a> •
    <a href="./contributing.md">Contribute</a>
  </p>
</div>