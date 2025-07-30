/**
 * Get help text for CLI commands
 */
export function getHelpText(): string {
	return `
Usage: ccflare-cli <command> [options]

Commands:
  add <name> [--mode <max|console>] [--tier <1|5|20>]
    Add a new account using OAuth
    --mode: Account type (optional, will prompt if not provided)
    --tier: Account tier (1, 5, or 20) (optional, will prompt for Max accounts)

  list
    List all accounts with their details

  remove <name> [--force]
    Remove an account
    --force: Skip confirmation prompt

  pause <name>
    Pause an account to exclude it from load balancing

  resume <name>
    Resume a paused account to include it in load balancing

  reset-stats
    Reset request counts for all accounts

  clear-history
    Clear request history

  analyze
    Analyze database performance and index usage

  help
    Show this help message

Examples:
  ccflare-cli add myaccount --mode max --tier 5
  ccflare-cli list
  ccflare-cli remove myaccount
  ccflare-cli pause myaccount
  ccflare-cli resume myaccount
`;
}
