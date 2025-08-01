import mysql from "mysql2/promise";
import type { DatabaseProvider } from "@ccflare/config";
import type { DatabaseConnection, DatabaseConnectionConfig } from "./database-provider";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";

/**
 * MySQL database provider using mysql2
 */
export class MySQLProvider implements DatabaseConnection {
	private pool: mysql.Pool;
	private drizzleDb: MySql2Database;
	private connection: mysql.PoolConnection | null = null;
	private inTransaction = false;

	constructor(config: DatabaseConnectionConfig) {
		if (!config.url) {
			throw new Error("MySQL requires a DATABASE_URL connection string");
		}

		this.pool = mysql.createPool({
			uri: config.url,
			// Connection pool configuration
			connectionLimit: 20, // Maximum number of connections in pool
			timeout: 60000, // Query timeout
			reconnect: true,
			// MySQL specific optimizations
			charset: 'utf8mb4',
			timezone: 'Z', // Use UTC
			// Note: acquireTimeout is valid but not in TypeScript definitions
			...(config.busyTimeoutMs && { acquireTimeout: config.busyTimeoutMs }),
		} as any);

		// Initialize Drizzle ORM
		this.drizzleDb = drizzle(this.pool);
	}

	private async getConnection(): Promise<mysql.PoolConnection> {
		if (this.inTransaction && this.connection) {
			return this.connection;
		}
		return this.pool.getConnection();
	}

	private async releaseConnection(connection: mysql.PoolConnection): Promise<void> {
		if (!this.inTransaction) {
			connection.release();
		}
	}

	async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
		const connection = await this.getConnection();
		try {
			const [rows] = await connection.execute(sql, params);
			return rows as T[];
		} finally {
			await this.releaseConnection(connection);
		}
	}

	async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
		const connection = await this.getConnection();
		try {
			const [rows] = await connection.execute(sql, params);
			const results = rows as T[];
			return results[0] || null;
		} finally {
			await this.releaseConnection(connection);
		}
	}

	async run(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
		const connection = await this.getConnection();
		try {
			const [result] = await connection.execute(sql, params);
			const resultInfo = result as mysql.ResultSetHeader;
			return {
				changes: resultInfo.affectedRows || 0,
				lastInsertRowid: resultInfo.insertId || undefined
			};
		} finally {
			await this.releaseConnection(connection);
		}
	}

	async beginTransaction(): Promise<void> {
		if (this.inTransaction) {
			throw new Error("Transaction already in progress");
		}
		
		this.connection = await this.pool.getConnection();
		await this.connection.beginTransaction();
		this.inTransaction = true;
	}

	async commit(): Promise<void> {
		if (!this.inTransaction || !this.connection) {
			throw new Error("No transaction in progress");
		}
		
		try {
			await this.connection.commit();
		} finally {
			this.connection.release();
			this.connection = null;
			this.inTransaction = false;
		}
	}

	async rollback(): Promise<void> {
		if (!this.inTransaction || !this.connection) {
			throw new Error("No transaction in progress");
		}
		
		try {
			await this.connection.rollback();
		} finally {
			this.connection.release();
			this.connection = null;
			this.inTransaction = false;
		}
	}

	async close(): Promise<void> {
		if (this.connection) {
			this.connection.release();
			this.connection = null;
		}
		await this.pool.end();
	}

	getProvider(): DatabaseProvider {
		return 'mysql';
	}

	getDrizzle(): MySql2Database {
		return this.drizzleDb;
	}
}
