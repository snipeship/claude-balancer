import { sql } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { text as pgText, integer as pgInteger, timestamp, boolean as pgBoolean, uuid, pgTable } from "drizzle-orm/pg-core";
import { text as mysqlText, int, timestamp as mysqlTimestamp, boolean as mysqlBoolean, varchar, mysqlTable } from "drizzle-orm/mysql-core";
import type { DatabaseProvider } from "@ccflare/config";

// SQLite schema
export const accountsSqlite = sqliteTable('accounts', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	provider: text('provider').default('anthropic'),
	apiKey: text('api_key'),
	refreshToken: text('refresh_token').notNull(),
	accessToken: text('access_token'),
	expiresAt: integer('expires_at'),
	createdAt: integer('created_at').notNull(),
	lastUsed: integer('last_used'),
	requestCount: integer('request_count').default(0),
	totalRequests: integer('total_requests').default(0),
	accountTier: integer('account_tier').default(1),
	rateLimitedUntil: integer('rate_limited_until'),
	sessionStart: integer('session_start'),
	sessionRequestCount: integer('session_request_count').default(0),
	paused: integer('paused').default(0), // SQLite doesn't have boolean, use integer
	rateLimitReset: integer('rate_limit_reset'),
	rateLimitStatus: text('rate_limit_status'),
	rateLimitRemaining: integer('rate_limit_remaining'),
});

// PostgreSQL schema
export const accountsPostgreSQL = pgTable('accounts', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: pgText('name').notNull().unique(),
	provider: pgText('provider').default('anthropic'),
	apiKey: pgText('api_key'),
	refreshToken: pgText('refresh_token').notNull(),
	accessToken: pgText('access_token'),
	expiresAt: timestamp('expires_at'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	lastUsed: timestamp('last_used'),
	requestCount: pgInteger('request_count').default(0),
	totalRequests: pgInteger('total_requests').default(0),
	accountTier: pgInteger('account_tier').default(1),
	rateLimitedUntil: timestamp('rate_limited_until'),
	sessionStart: timestamp('session_start'),
	sessionRequestCount: pgInteger('session_request_count').default(0),
	paused: pgBoolean('paused').default(false),
	rateLimitReset: timestamp('rate_limit_reset'),
	rateLimitStatus: pgText('rate_limit_status'),
	rateLimitRemaining: pgInteger('rate_limit_remaining'),
});

// MySQL schema
export const accountsMySQL = mysqlTable('accounts', {
	id: varchar('id', { length: 36 }).primaryKey(),
	name: varchar('name', { length: 255 }).notNull().unique(),
	provider: varchar('provider', { length: 50 }).default('anthropic'),
	apiKey: mysqlText('api_key'),
	refreshToken: mysqlText('refresh_token').notNull(),
	accessToken: mysqlText('access_token'),
	expiresAt: mysqlTimestamp('expires_at'),
	createdAt: mysqlTimestamp('created_at').defaultNow().notNull(),
	lastUsed: mysqlTimestamp('last_used'),
	requestCount: int('request_count').default(0),
	totalRequests: int('total_requests').default(0),
	accountTier: int('account_tier').default(1),
	rateLimitedUntil: mysqlTimestamp('rate_limited_until'),
	sessionStart: mysqlTimestamp('session_start'),
	sessionRequestCount: int('session_request_count').default(0),
	paused: mysqlBoolean('paused').default(false),
	rateLimitReset: mysqlTimestamp('rate_limit_reset'),
	rateLimitStatus: varchar('rate_limit_status', { length: 50 }),
	rateLimitRemaining: int('rate_limit_remaining'),
});

// Helper function to get the correct accounts table based on provider
export function getAccountsTable(provider: DatabaseProvider) {
	switch (provider) {
		case 'sqlite':
			return accountsSqlite;
		case 'postgresql':
			return accountsPostgreSQL;
		case 'mysql':
			return accountsMySQL;
		default:
			throw new Error(`Unsupported database provider: ${provider}`);
	}
}
