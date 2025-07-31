import type { DatabaseProvider } from "@ccflare/config";
import type { DatabaseConnection } from "../providers/database-provider";
import { Logger } from "@ccflare/logger";

const log = new Logger("SchemaValidator");

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	missingTables: string[];
	missingColumns: { table: string; column: string }[];
}

/**
 * Expected table structure for validation
 */
interface TableSchema {
	name: string;
	columns: ColumnSchema[];
	indexes?: string[];
}

interface ColumnSchema {
	name: string;
	type: string;
	nullable: boolean;
	defaultValue?: string;
	isPrimaryKey?: boolean;
	isForeignKey?: boolean;
	references?: { table: string; column: string };
}

/**
 * Validate database schema across different providers
 */
export class SchemaValidator {
	private expectedTables: TableSchema[] = [
		{
			name: 'accounts',
			columns: [
				{ name: 'id', type: 'string', nullable: false, isPrimaryKey: true },
				{ name: 'name', type: 'string', nullable: false },
				{ name: 'provider', type: 'string', nullable: true, defaultValue: 'anthropic' },
				{ name: 'api_key', type: 'string', nullable: true },
				{ name: 'refresh_token', type: 'string', nullable: false },
				{ name: 'access_token', type: 'string', nullable: true },
				{ name: 'expires_at', type: 'timestamp', nullable: true },
				{ name: 'created_at', type: 'timestamp', nullable: false },
				{ name: 'last_used', type: 'timestamp', nullable: true },
				{ name: 'request_count', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'total_requests', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'account_tier', type: 'integer', nullable: true, defaultValue: '1' },
				{ name: 'rate_limited_until', type: 'timestamp', nullable: true },
				{ name: 'session_start', type: 'timestamp', nullable: true },
				{ name: 'session_request_count', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'paused', type: 'boolean', nullable: true, defaultValue: '0' },
				{ name: 'rate_limit_reset', type: 'timestamp', nullable: true },
				{ name: 'rate_limit_status', type: 'string', nullable: true },
				{ name: 'rate_limit_remaining', type: 'integer', nullable: true },
			],
		},
		{
			name: 'requests',
			columns: [
				{ name: 'id', type: 'string', nullable: false, isPrimaryKey: true },
				{ name: 'timestamp', type: 'timestamp', nullable: false },
				{ name: 'method', type: 'string', nullable: false },
				{ name: 'path', type: 'string', nullable: false },
				{ name: 'account_used', type: 'string', nullable: true, isForeignKey: true, references: { table: 'accounts', column: 'id' } },
				{ name: 'status_code', type: 'integer', nullable: true },
				{ name: 'success', type: 'boolean', nullable: true },
				{ name: 'error_message', type: 'string', nullable: true },
				{ name: 'response_time_ms', type: 'integer', nullable: true },
				{ name: 'failover_attempts', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'model', type: 'string', nullable: true },
				{ name: 'prompt_tokens', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'completion_tokens', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'total_tokens', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'cost_usd', type: 'decimal', nullable: true, defaultValue: '0' },
				{ name: 'output_tokens_per_second', type: 'decimal', nullable: true },
				{ name: 'input_tokens', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'cache_read_input_tokens', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'cache_creation_input_tokens', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'output_tokens', type: 'integer', nullable: true, defaultValue: '0' },
				{ name: 'agent_used', type: 'string', nullable: true },
			],
			indexes: ['idx_requests_timestamp', 'idx_requests_account_used', 'idx_requests_timestamp_account'],
		},
		{
			name: 'request_payloads',
			columns: [
				{ name: 'id', type: 'string', nullable: false, isPrimaryKey: true, isForeignKey: true, references: { table: 'requests', column: 'id' } },
				{ name: 'json', type: 'string', nullable: false },
			],
		},
		{
			name: 'oauth_sessions',
			columns: [
				{ name: 'id', type: 'string', nullable: false, isPrimaryKey: true },
				{ name: 'account_name', type: 'string', nullable: false },
				{ name: 'verifier', type: 'string', nullable: false },
				{ name: 'mode', type: 'string', nullable: false },
				{ name: 'tier', type: 'integer', nullable: true, defaultValue: '1' },
				{ name: 'created_at', type: 'timestamp', nullable: false },
				{ name: 'expires_at', type: 'timestamp', nullable: false },
			],
			indexes: ['idx_oauth_sessions_expires'],
		},
		{
			name: 'agent_preferences',
			columns: [
				{ name: 'agent_id', type: 'string', nullable: false, isPrimaryKey: true },
				{ name: 'model', type: 'string', nullable: false },
				{ name: 'updated_at', type: 'timestamp', nullable: false },
			],
		},
		{
			name: 'strategies',
			columns: [
				{ name: 'name', type: 'string', nullable: false, isPrimaryKey: true },
				{ name: 'config', type: 'string', nullable: false },
				{ name: 'updated_at', type: 'timestamp', nullable: false },
			],
		},
	];

	/**
	 * Validate the database schema
	 */
	async validateSchema(
		connection: DatabaseConnection,
		provider: DatabaseProvider
	): Promise<SchemaValidationResult> {
		const result: SchemaValidationResult = {
			isValid: true,
			errors: [],
			warnings: [],
			missingTables: [],
			missingColumns: [],
		};

		try {
			log.info(`Validating schema for ${provider} database`);

			// Check if all expected tables exist
			for (const expectedTable of this.expectedTables) {
				const tableExists = await this.checkTableExists(connection, expectedTable.name, provider);
				
				if (!tableExists) {
					result.missingTables.push(expectedTable.name);
					result.errors.push(`Missing table: ${expectedTable.name}`);
					result.isValid = false;
					continue;
				}

				// Check columns for existing tables
				const missingColumns = await this.validateTableColumns(
					connection,
					expectedTable,
					provider
				);
				
				result.missingColumns.push(...missingColumns);
				if (missingColumns.length > 0) {
					result.isValid = false;
					result.errors.push(
						`Missing columns in table ${expectedTable.name}: ${missingColumns
							.map(c => c.column)
							.join(', ')}`
					);
				}
			}

			if (result.isValid) {
				log.info(`Schema validation passed for ${provider}`);
			} else {
				log.warn(`Schema validation failed for ${provider}:`, result.errors);
			}

		} catch (error) {
			result.isValid = false;
			result.errors.push(`Schema validation error: ${error}`);
			log.error(`Schema validation error for ${provider}:`, error);
		}

		return result;
	}

	/**
	 * Check if a table exists in the database
	 */
	private async checkTableExists(
		connection: DatabaseConnection,
		tableName: string,
		provider: DatabaseProvider
	): Promise<boolean> {
		try {
			let query: string;
			
			switch (provider) {
				case 'sqlite':
					query = `SELECT name FROM sqlite_master WHERE type='table' AND name=?`;
					break;
				case 'postgresql':
					query = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`;
					break;
				case 'mysql':
					query = `SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?`;
					break;
				default:
					throw new Error(`Unsupported database provider: ${provider}`);
			}

			const result = await connection.get(query, [tableName]);
			return result !== null;
		} catch (error) {
			log.error(`Error checking table existence for ${tableName}:`, error);
			return false;
		}
	}

	/**
	 * Validate columns for a specific table
	 */
	private async validateTableColumns(
		connection: DatabaseConnection,
		expectedTable: TableSchema,
		provider: DatabaseProvider
	): Promise<{ table: string; column: string }[]> {
		const missingColumns: { table: string; column: string }[] = [];

		try {
			let query: string;
			let params: any[] = [];

			switch (provider) {
				case 'sqlite':
					// Validate table name to prevent SQL injection
					if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expectedTable.name)) {
						throw new Error(`Invalid table name: ${expectedTable.name}`);
					}
					query = `PRAGMA table_info(${expectedTable.name})`;
					// PRAGMA doesn't support parameters
					break;
				case 'postgresql':
					query = `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`;
					params = [expectedTable.name];
					break;
				case 'mysql':
					query = `SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?`;
					params = [expectedTable.name];
					break;
				default:
					throw new Error(`Unsupported database provider: ${provider}`);
			}

			const columns = await connection.query(query, params);
			const existingColumnNames = new Set(
				columns.map((col: any) => 
					provider === 'sqlite' ? col.name : col.column_name
				)
			);

			for (const expectedColumn of expectedTable.columns) {
				if (!existingColumnNames.has(expectedColumn.name)) {
					missingColumns.push({
						table: expectedTable.name,
						column: expectedColumn.name,
					});
				}
			}
		} catch (error) {
			log.error(`Error validating columns for table ${expectedTable.name}:`, error);
		}

		return missingColumns;
	}
}
