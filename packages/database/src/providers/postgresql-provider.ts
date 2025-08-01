import { Pool, type PoolClient } from "pg";
import type { DatabaseProvider } from "@ccflare/config";
import type { DatabaseConnection, DatabaseConnectionConfig } from "./database-provider";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * PostgreSQL database provider using node-postgres
 */
export class PostgreSQLProvider implements DatabaseConnection {
	private pool: Pool;
	private drizzleDb: NodePgDatabase;
	private client: PoolClient | null = null;
	private inTransaction = false;

	constructor(config: DatabaseConnectionConfig) {
		if (!config.url) {
			throw new Error("PostgreSQL requires a DATABASE_URL connection string");
		}

		this.pool = new Pool({
			connectionString: config.url,
			// Connection pool configuration
			max: 20, // Maximum number of clients in the pool
			idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
			connectionTimeoutMillis: config.busyTimeoutMs || 10000, // Wait 10 seconds for connection
		});

		// Handle pool errors
		this.pool.on('error', (err) => {
			console.error('Unexpected error on idle client', err);
		});

		// Initialize Drizzle ORM
		this.drizzleDb = drizzle(this.pool);
	}

	private async getClient(): Promise<PoolClient> {
		if (this.inTransaction && this.client) {
			return this.client;
		}
		return this.pool.connect();
	}

	private async releaseClient(client: PoolClient): Promise<void> {
		if (!this.inTransaction) {
			client.release();
		}
	}

	async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
		const client = await this.getClient();
		try {
			const result = await client.query(sql, params);
			return result.rows as T[];
		} finally {
			await this.releaseClient(client);
		}
	}

	async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
		const client = await this.getClient();
		try {
			const result = await client.query(sql, params);
			return result.rows[0] as T || null;
		} finally {
			await this.releaseClient(client);
		}
	}

	async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
		const client = await this.getClient();
		try {
			const result = await client.query(sql, params);
			return {
				changes: result.rowCount || 0,
				// PostgreSQL doesn't have lastInsertRowid, would need RETURNING clause
				lastInsertRowid: undefined
			};
		} finally {
			await this.releaseClient(client);
		}
	}

	async beginTransaction(): Promise<void> {
		if (this.inTransaction) {
			throw new Error("Transaction already in progress");
		}
		
		this.client = await this.pool.connect();
		await this.client.query('BEGIN');
		this.inTransaction = true;
	}

	async commit(): Promise<void> {
		if (!this.inTransaction || !this.client) {
			throw new Error("No transaction in progress");
		}
		
		try {
			await this.client.query('COMMIT');
		} finally {
			this.client.release();
			this.client = null;
			this.inTransaction = false;
		}
	}

	async rollback(): Promise<void> {
		if (!this.inTransaction || !this.client) {
			throw new Error("No transaction in progress");
		}
		
		try {
			await this.client.query('ROLLBACK');
		} finally {
			this.client.release();
			this.client = null;
			this.inTransaction = false;
		}
	}

	async close(): Promise<void> {
		if (this.client) {
			this.client.release();
			this.client = null;
		}
		await this.pool.end();
	}

	getProvider(): DatabaseProvider {
		return 'postgresql';
	}

	getDrizzle(): NodePgDatabase {
		return this.drizzleDb;
	}
}
