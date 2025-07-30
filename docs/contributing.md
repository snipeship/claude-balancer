# Contributing to ccflare

Welcome to ccflare! We're thrilled that you're interested in contributing to our Claude load balancer project. This document provides guidelines and instructions for contributing to the project.

## Table of Contents

1. [Welcome & Code of Conduct](#welcome--code-of-conduct)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Coding Standards](#coding-standards)
5. [Commit Message Format](#commit-message-format)
6. [Pull Request Process](#pull-request-process)
7. [Testing Guidelines](#testing-guidelines)
8. [Documentation Standards](#documentation-standards)
9. [Adding New Features Checklist](#adding-new-features-checklist)
10. [Release Process](#release-process)
11. [Common Development Tasks](#common-development-tasks)

## Welcome & Code of Conduct

First off, thank you for considering contributing to ccflare! We welcome contributions from everyone, regardless of their background or experience level.

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. We pledge to:

- Be respectful and inclusive in our language and actions
- Welcome newcomers and help them get started
- Respect differing viewpoints and experiences
- Show empathy towards other community members
- Focus on what is best for the community and the project

### Expected Behavior

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, discrimination, or personal attacks
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate

## Development Setup

### Prerequisites

Before you begin, ensure you have the following installed:

- **Bun** >= 1.2.8 (required): Install from [bun.sh](https://bun.sh)
- **Git**: For version control
- **SQLite**: Comes bundled with Bun, no separate installation needed

**Note**: Node.js is not required as the project uses Bun exclusively.

### Cloning and Installing

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ccflare.git
   cd ccflare
   ```

3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/ccflare.git
   ```

4. **Install dependencies**:
   ```bash
   bun install
   ```

5. **Verify the installation**:
   ```bash
   # Run type checking
   bun run typecheck
   
   # Run linting
   bun run lint
   
   # Run formatting
   bun run format
   ```

### Environment Variables (Optional)

The following environment variables can be used during development:

- `LB_STRATEGY` - Override the default load balancing strategy
- `CLIENT_ID` - Set a custom OAuth client ID
- `RETRY_ATTEMPTS` - Number of retry attempts for failed requests
- `RETRY_DELAY_MS` - Delay between retry attempts in milliseconds

**Note**: Most configuration is handled through the config file and CLI. Environment variables are optional overrides.

### Running the Development Environment

```bash
# Start the server in development mode with hot reload
bun run dev:server

# In another terminal, start the CLI
bun run dev:cli

# Or start the TUI interface
bun run dev

# Or work on the dashboard
bun run dev:dashboard
```

### Running Tests

**Note**: The project is currently in the process of setting up a comprehensive test suite. Test infrastructure is not yet implemented.

When implemented, tests will use Bun's built-in test runner:

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests for a specific package
bun test packages/core
```

### Important Post-Change Commands

After making any code changes, always run these commands before committing:

```bash
# Fix linting issues
bun run lint

# Check for type errors
bun run typecheck

# Format code
bun run format
```

### CLAUDE.md File

The project includes a `CLAUDE.md` file in the root directory that provides guidance to Claude Code (claude.ai/code) when working with the codebase. This file contains:
- Project overview and purpose
- Important commands to run after making changes
- Development and maintenance commands
- Project-specific guidelines

When contributing, ensure any major architectural changes or new patterns are documented in CLAUDE.md to help future AI-assisted development.

## Project Structure

ccflare is organized as a Bun monorepo with clear separation of concerns:

```
ccflare/
├── apps/                    # Deployable applications
│   ├── cli/                # Command-line interface
│   ├── lander/            # Static landing page
│   ├── server/            # Main HTTP server
│   └── tui/               # Terminal UI (Ink-based)
├── packages/              # Shared libraries
│   ├── cli-commands/      # CLI command implementations
│   ├── config/            # Configuration management
│   ├── core/              # Core utilities and types
│   ├── core-di/           # Dependency injection
│   ├── dashboard-web/     # React dashboard
│   ├── database/          # SQLite operations
│   ├── http-api/          # REST API handlers
│   ├── load-balancer/     # Load balancing strategies
│   ├── logger/            # Logging utilities
│   ├── providers/         # AI provider integrations
│   ├── proxy/             # Request proxy logic
│   ├── tui-core/          # TUI screen components
│   └── types/             # Shared TypeScript types
├── docs/                  # Documentation
├── biome.json            # Linting and formatting config
├── package.json          # Root workspace configuration
└── tsconfig.json         # TypeScript configuration
```

### Key Directories

- **`apps/`**: Contains all deployable applications. Each app has its own `package.json` and can be built independently.
- **`packages/`**: Shared code that multiple apps depend on. These are internal packages linked via Bun workspaces.
- **`docs/`**: Project documentation including architecture, data flow, and this contributing guide.

### Package Naming Convention

- Apps: Simple names (e.g., `server`, `cli`, `tui`)
- Packages: Prefixed with `@ccflare/` (e.g., `@ccflare/core`, `@ccflare/database`)

## Coding Standards

We use Biome for both linting and formatting to maintain consistent code quality across the project.

### TypeScript Style Guide

1. **Type Safety**
   - Always use explicit types for function parameters and return values
   - Avoid using `any` - use `unknown` if the type is truly unknown
   - Prefer interfaces over type aliases for object shapes
   - Use const assertions for literal types

   ```typescript
   // Good
   interface Account {
     id: string;
     name: string;
     tier: 1 | 5 | 20;
   }
   
   function getAccount(id: string): Account | null {
     // ...
   }
   
   // Bad
   function getAccount(id: any) {
     // ...
   }
   ```

2. **Async/Await**
   - Always use async/await instead of promises
   - Handle errors with try/catch blocks
   - Use Promise.all for concurrent operations

   ```typescript
   // Good
   async function fetchData() {
     try {
       const [accounts, requests] = await Promise.all([
         getAccounts(),
         getRequests()
       ]);
       return { accounts, requests };
     } catch (error) {
       logger.error('Failed to fetch data', error);
       throw error;
     }
   }
   ```

3. **Error Handling**
   - Create custom error classes for domain-specific errors
   - Always include context in error messages
   - Use error boundaries in React components

4. **Naming Conventions**
   - Use camelCase for variables and functions
   - Use PascalCase for types, interfaces, and classes
   - Use UPPER_SNAKE_CASE for constants
   - Prefix boolean variables with `is`, `has`, or `should`

   ```typescript
   const MAX_RETRIES = 3;
   const isRateLimited = true;
   
   interface AccountStatus {
     hasValidToken: boolean;
     isActive: boolean;
   }
   ```

### Biome Linting Rules

Our Biome configuration enforces:

- Tab indentation (not spaces)
- Double quotes for strings
- Organized imports (automatic with `organizeImports: "on"`)
- All recommended Biome rules
- Consistent code formatting

Run linting and auto-fix issues with:
```bash
bun run lint
```

**Note**: The lint command includes `--write --unsafe` flags which will automatically fix issues where possible.

### Import Conventions

1. **Import Order** (automatically organized by Biome):
   - External packages
   - Internal packages (`@ccflare/*`)
   - Relative imports
   - Type imports

2. **Path Aliases**:
   - Use package imports for cross-package dependencies
   - Use relative imports within the same package
   - Avoid circular dependencies

   ```typescript
   // Good
   import { Database } from '@ccflare/database';
   import { LoadBalancer } from '@ccflare/load-balancer';
   import { formatDate } from './utils';
   import type { Account } from '@ccflare/types';
   
   // Bad
   import { Database } from '../../../packages/database/src';
   ```

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for our commit messages.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (formatting)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Changes to build system or dependencies
- **ci**: Changes to CI configuration
- **chore**: Other changes that don't modify src or test files

### Scope

The scope should be the package or app name:
- `server`, `cli`, `tui`, `lander`
- `core`, `database`, `proxy`, `load-balancer`, etc.

### Examples

```bash
feat(load-balancer): improve session persistence

Enhances the session-based strategy to better handle failover scenarios
while maintaining session affinity. This reduces rate limit occurrences
and improves overall reliability.

Closes #123

---

fix(proxy): handle token refresh race condition

Multiple concurrent requests were causing token refresh stampedes.
Added mutex to ensure only one refresh happens at a time.

---

docs(contributing): add testing guidelines section

---

refactor(database): extract migration logic to separate module

This improves testability and makes the migration system more modular.

BREAKING CHANGE: Database.migrate() method signature has changed
```

## Pull Request Process

### Before Creating a PR

1. **Sync with upstream**:
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

### Branch Naming

Use descriptive branch names with prefixes:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates
- `perf/` - Performance improvements

Examples:
- `feature/add-openai-provider`
- `fix/rate-limit-detection`
- `docs/update-api-endpoints`

### PR Template

When creating a PR, include:

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Changes Made
- List specific changes made
- Include relevant code snippets if helpful
- Mention any dependencies added or removed

## Testing
- [ ] I have run `bun run lint` and fixed all issues
- [ ] I have run `bun run format` to format the code
- [ ] I have run `bun run typecheck` and fixed all type errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## Screenshots (if applicable)
Add screenshots for UI changes.

## Checklist
- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged and published

## Related Issues
Closes #(issue number)
```

### Review Process

1. **Manual Checks**: Run `bun run lint`, `bun run typecheck`, and `bun run format` locally
2. **Code Review**: At least one maintainer must review and approve
3. **Testing**: Reviewer may ask for additional tests or manual testing
4. **Documentation**: Ensure docs are updated if needed
5. **Merge**: Maintainer will merge using "Squash and merge"

**Note**: CI/CD is not yet implemented. Contributors must ensure all checks pass locally before submitting PRs. There is also no PR template in the repository yet - please follow the template provided in this guide when creating PRs.

### After PR is Merged

1. Delete your feature branch
2. Update your local main branch
3. Celebrate! 🎉

## Testing Guidelines

**Current Status**: Test infrastructure is not yet implemented. This section describes the planned testing approach.

### Future Test Structure

Tests will be co-located with the code they test:

```
packages/core/
├── src/
│   ├── index.ts
│   ├── index.test.ts
│   ├── utils.ts
│   └── utils.test.ts
└── package.json
```

### Writing Tests (Future Implementation)

1. **Unit Tests**
   - Test individual functions and classes
   - Mock external dependencies
   - Aim for high code coverage
   - Use descriptive test names

   ```typescript
   import { describe, it, expect, mock } from 'bun:test';
   import { calculateAccountWeight } from './utils';
   
   describe('calculateAccountWeight', () => {
     it('should return 1 for pro tier accounts', () => {
       const account = { tier: 1, name: 'pro-account' };
       expect(calculateAccountWeight(account)).toBe(1);
     });
     
     it('should return 5 for max 5x tier accounts', () => {
       const account = { tier: 5, name: 'max-5x-account' };
       expect(calculateAccountWeight(account)).toBe(5);
     });
   });
   ```

2. **Integration Tests**
   - Test interactions between modules
   - Use real database for database tests
   - Test API endpoints end-to-end

3. **E2E Tests** (when implemented)
   - Test complete user workflows
   - Use real browser for dashboard tests
   - Test CLI commands

### Test Best Practices

- Write tests before fixing bugs (regression tests)
- Keep tests focused and independent
- Use meaningful assertions
- Clean up test data after tests
- Use test fixtures for complex data

## Documentation Standards

### Code Documentation

1. **JSDoc Comments**
   - Document all public APIs
   - Include parameter descriptions
   - Add usage examples

   ```typescript
   /**
    * Selects the best account for handling a request based on the configured strategy.
    * 
    * @param accounts - List of available accounts
    * @param strategy - Load balancing strategy to use
    * @returns The selected account or null if no accounts are available
    * 
    * @example
    * const account = selectAccount(accounts, 'session');
    * if (account) {
    *   await forwardRequest(account, request);
    * }
    */
   export function selectAccount(
     accounts: Account[], 
     strategy: LoadBalancingStrategy
   ): Account | null {
     // ...
   }
   ```

2. **README Files**
   - Each package should have a README
   - Include installation, usage, and API docs
   - Add examples and common patterns

3. **Architecture Documentation**
   - Update `/docs` when adding major features
   - Include diagrams for complex flows
   - Document design decisions

### Documentation Checklist

- [ ] All public APIs have JSDoc comments
- [ ] Complex algorithms have explanatory comments
- [ ] Package README is updated
- [ ] Architecture docs reflect changes
- [ ] Examples are tested and working

## Adding New Features Checklist

When adding a new feature, follow this checklist:

### 1. Planning Phase
- [ ] Create an issue describing the feature
- [ ] Discuss implementation approach with maintainers
- [ ] Identify which packages will be affected
- [ ] Consider backward compatibility

### 2. Implementation Phase
- [ ] Create feature branch from latest main
- [ ] Implement feature following coding standards
- [ ] Add unit tests (aim for >80% coverage)
- [ ] Add integration tests if applicable
- [ ] Update TypeScript types
- [ ] Handle errors gracefully

### 3. Documentation Phase
- [ ] Add JSDoc comments to new functions
- [ ] Update package README if needed
- [ ] Update architecture docs for significant changes
- [ ] Add usage examples

### 4. Testing Phase
- [ ] Run all tests locally
- [ ] Test manually in development environment
- [ ] Test with different configurations
- [ ] Verify no performance regressions

### 5. Review Phase
- [ ] Self-review your code
- [ ] Run linting and formatting
- [ ] Ensure all CI checks pass
- [ ] Create PR with detailed description

### 6. Post-Merge Phase
- [ ] Monitor for any issues
- [ ] Update related issues
- [ ] Help with any user questions

## Release Process

### Version Management

We use semantic versioning (SemVer):
- **Major** (X.0.0): Breaking changes
- **Minor** (0.X.0): New features (backward compatible)
- **Patch** (0.0.X): Bug fixes

### Release Workflow

1. **Prepare Release**
   ```bash
   # Update version in package.json files
   # Create/Update CHANGELOG.md (if not exists, create following Keep a Changelog format)
   git checkout -b release/vX.Y.Z
   ```

2. **Create Release PR**
   - Title: `Release vX.Y.Z`
   - Include changelog in description
   - Get approval from maintainers

3. **Merge and Tag**
   ```bash
   git checkout main
   git pull upstream main
   git tag -a vX.Y.Z -m "Release version X.Y.Z"
   git push upstream vX.Y.Z
   ```

4. **Create GitHub Release**
   - Use the tag
   - Copy changelog entries
   - Attach built binaries if applicable

5. **Post-Release**
   - Announce in discussions/Discord
   - Update documentation site
   - Monitor for issues

**Note**: There is no CHANGELOG.md file in the repository yet. When implementing releases, create and maintain a CHANGELOG.md file following the [Keep a Changelog](https://keepachangelog.com/) format.

### Emergency Patches

For critical fixes:
1. Create patch from the release tag
2. Follow expedited review process
3. Release as patch version

## Getting Help

If you need help:

1. **Documentation**: Check the `/docs` folder
2. **Issues**: Search existing issues
3. **Discussions**: Start a GitHub discussion
4. **Discord**: Join our community (if applicable)

## Recognition

Contributors are recognized in:
- GitHub contributors page
- Release notes
- Project README (for significant contributions)

## Common Development Tasks

### Working with the CLI

The CLI functionality is integrated into the TUI application. Use `ccflare` with command-line flags:

```bash
# If ccflare is not installed globally, use:
# bun run tui [options]
# or build and run with: bun run ccflare

# Add a new account
ccflare --add-account <name>
# With options:
ccflare --add-account <name> --mode <max|console> --tier <1|5|20>

# List all accounts
ccflare --list

# Remove an account
ccflare --remove <name>

# Pause/resume accounts
ccflare --pause <name>
ccflare --resume <name>

# Reset usage statistics
ccflare --reset-stats

# Clear request history
ccflare --clear-history

# View statistics (JSON output)
ccflare --stats

# Stream logs
ccflare --logs [N]  # Show N lines of history then follow

# Analyze database performance
ccflare --analyze

# Start server with dashboard
ccflare --serve --port 8080

# Show help
ccflare --help
```

### Running the Server

```bash
# Start the production server (port 8080)
bun run server
# or
bun run start
# or
bun start

# Start the server with hot reload
bun run dev:server
```

### Working with the Dashboard

```bash
# Build the dashboard
bun run build:dashboard

# Run dashboard in development mode
bun run dev:dashboard
```

### Working with the TUI

```bash
# Run the TUI application
bun run tui
# or
bun run dev
# or (builds first, then runs)
bun run ccflare

# Build the TUI
bun run build:tui
```

### Building for Production

```bash
# Build all applications
bun run build

# Build specific applications
bun run build:dashboard
bun run build:tui
bun run build:lander
```

### Troubleshooting Common Issues

1. **TypeScript errors**: Run `bun run typecheck` to identify issues
2. **Formatting issues**: Run `bun run format` to auto-fix
3. **Import errors**: Ensure you're using workspace imports (`@ccflare/*`) for cross-package dependencies
4. **Database issues**: The SQLite database is created automatically in the data directory

Thank you for contributing to ccflare! Your efforts help make Claude AI more accessible to everyone.