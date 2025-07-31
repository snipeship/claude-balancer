import type { DatabaseProvider } from "@ccflare/config";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

/**
 * Database connection interface that abstracts different database providers
 */
export interface DatabaseConnection {
	/** Execute a query and return all results */
	query<T = any>(sql: string, params?: any[]): Promise<T[]>;

	/** Execute a query and return the first result */
	get<T = any>(sql: string, params?: any[]): Promise<T | null>;

	/** Execute a statement (INSERT, UPDATE, DELETE) */
	run(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid?: number }>;

	/** Begin a transaction */
	beginTransaction(): Promise<void>;

	/** Commit a transaction */
	commit(): Promise<void>;

	/** Rollback a transaction */
	rollback(): Promise<void>;

	/** Close the database connection */
	close(): Promise<void>;

	/** Get the database provider type */
	getProvider(): DatabaseProvider;

	/** Get the Drizzle ORM instance */
	getDrizzle(): BunSQLiteDatabase<any> | DrizzleD1Database<any> | NodePgDatabase<any> | MySql2Database<any>;
}

/**
 * Configuration for database connections
 */
export interface DatabaseConnectionConfig {
	provider: DatabaseProvider;
	url?: string;
	dbPath?: string;
	walMode?: boolean;
	busyTimeoutMs?: number;
	cacheSize?: number;
	synchronous?: 'OFF' | 'NORMAL' | 'FULL';
	mmapSize?: number;
}
