
import { text, integer, sqliteTable, index } from "drizzle-orm/sqlite-core";
import { text as pgText, integer as pgInteger, timestamp, uuid, pgTable, index as pgIndex } from "drizzle-orm/pg-core";
import { text as mysqlText, int, timestamp as mysqlTimestamp, varchar, mysqlTable, index as mysqlIndex } from "drizzle-orm/mysql-core";
import type { DatabaseProvider } from "@ccflare/config";

// SQLite schema
export const oauthSessionsSqlite = sqliteTable('oauth_sessions', {
	id: text('id').primaryKey(),
	accountName: text('account_name').notNull(),
	verifier: text('verifier').notNull(),
	mode: text('mode').notNull(),
	tier: integer('tier').default(1),
	createdAt: integer('created_at').notNull(),
	expiresAt: integer('expires_at').notNull(),
}, (table) => ({
	expiresIdx: index('idx_oauth_sessions_expires').on(table.expiresAt),
}));

// PostgreSQL schema
export const oauthSessionsPostgreSQL = pgTable('oauth_sessions', {
	id: uuid('id').primaryKey(),
	accountName: pgText('account_name').notNull(),
	verifier: pgText('verifier').notNull(),
	mode: pgText('mode').notNull(),
	tier: pgInteger('tier').default(1),
	createdAt: timestamp('created_at').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
	expiresIdx: pgIndex('idx_oauth_sessions_expires').on(table.expiresAt),
}));

// MySQL schema
export const oauthSessionsMySQL = mysqlTable('oauth_sessions', {
	id: varchar('id', { length: 36 }).primaryKey(),
	accountName: varchar('account_name', { length: 255 }).notNull(),
	verifier: mysqlText('verifier').notNull(),
	mode: varchar('mode', { length: 20 }).notNull(),
	tier: int('tier').default(1),
	createdAt: mysqlTimestamp('created_at').defaultNow().notNull(),
	expiresAt: mysqlTimestamp('expires_at').notNull(),
}, (table) => ({
	expiresIdx: mysqlIndex('idx_oauth_sessions_expires').on(table.expiresAt),
}));

// Helper function to get the correct oauth_sessions table based on provider
export function getOAuthSessionsTable(provider: DatabaseProvider) {
	switch (provider) {
		case 'sqlite':
			return oauthSessionsSqlite;
		case 'postgresql':
			return oauthSessionsPostgreSQL;
		case 'mysql':
			return oauthSessionsMySQL;
		default:
			throw new Error(`Unsupported database provider: ${provider}`);
	}
}
