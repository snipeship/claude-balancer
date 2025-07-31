import type { DatabaseProvider } from "@ccflare/config";
import type { DatabaseConnection, DatabaseConnectionConfig } from "./database-provider";
import { SQLiteProvider } from "./sqlite-provider";
import { PostgreSQLProvider } from "./postgresql-provider";
import { MySQLProvider } from "./mysql-provider";

/**
 * Factory for creating database connections based on provider type
 */
export class DatabaseProviderFactory {
	/**
	 * Create a database connection based on the provider configuration
	 */
	static createConnection(config: DatabaseConnectionConfig): DatabaseConnection {
		switch (config.provider) {
			case 'sqlite':
				return new SQLiteProvider(config);
			
			case 'postgresql':
				return new PostgreSQLProvider(config);
			
			case 'mysql':
				return new MySQLProvider(config);
			
			default:
				throw new Error(`Unsupported database provider: ${config.provider}`);
		}
	}

	/**
	 * Validate database configuration
	 */
	static validateConfig(config: DatabaseConnectionConfig): void {
		if (!config.provider) {
			throw new Error("Database provider is required");
		}

		if (!this.getSupportedProviders().includes(config.provider)) {
			throw new Error(`Unsupported database provider: ${config.provider}`);
		}

		// PostgreSQL and MySQL require a connection URL
		if ((config.provider === 'postgresql' || config.provider === 'mysql') && !config.url) {
			throw new Error(`${config.provider} requires a DATABASE_URL connection string`);
		}

		// SQLite requires either dbPath or a file:// URL
		if (config.provider === 'sqlite') {
			const hasDbPath = !!config.dbPath;
			const hasFileUrl = !!config.url && config.url.startsWith('file://');

			if (!hasDbPath && !hasFileUrl) {
				throw new Error("SQLite requires either a file path (dbPath) or file:// URL");
			}
		}
	}

	/**
	 * Get supported database providers
	 */
	static getSupportedProviders(): DatabaseProvider[] {
		return ['sqlite', 'postgresql', 'mysql'];
	}
}
