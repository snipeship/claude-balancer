import { text, sqliteTable } from "drizzle-orm/sqlite-core";
import { uuid, pgTable, jsonb } from "drizzle-orm/pg-core";
import { varchar, mysqlTable, json } from "drizzle-orm/mysql-core";
import type { DatabaseProvider } from "@ccflare/config";
import { requestsSqlite, requestsPostgreSQL, requestsMySQL } from "./requests";

// SQLite schema
export const requestPayloadsSqlite = sqliteTable('request_payloads', {
	id: text('id').primaryKey().references(() => requestsSqlite.id, { onDelete: 'cascade' }),
	json: text('json').notNull(),
});

// PostgreSQL schema
export const requestPayloadsPostgreSQL = pgTable('request_payloads', {
	id: uuid('id').primaryKey().references(() => requestsPostgreSQL.id, { onDelete: 'cascade' }),
	json: jsonb('json').notNull(),
});

// MySQL schema
export const requestPayloadsMySQL = mysqlTable('request_payloads', {
	id: varchar('id', { length: 36 }).primaryKey().references(() => requestsMySQL.id, { onDelete: 'cascade' }),
	json: json('json').notNull(),
});

// Helper function to get the correct request_payloads table based on provider
export function getRequestPayloadsTable(provider: DatabaseProvider) {
	switch (provider) {
		case 'sqlite':
			return requestPayloadsSqlite;
		case 'postgresql':
			return requestPayloadsPostgreSQL;
		case 'mysql':
			return requestPayloadsMySQL;
		default:
			throw new Error(`Unsupported database provider: ${provider}`);
	}
}
