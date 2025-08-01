import { sql, desc } from "drizzle-orm";
import { text, integer, sqliteTable, real, index } from "drizzle-orm/sqlite-core";
import { text as pgText, integer as pgInteger, timestamp, boolean as pgBoolean, uuid, pgTable, decimal, real as pgReal, index as pgIndex } from "drizzle-orm/pg-core";
import { text as mysqlText, int, timestamp as mysqlTimestamp, boolean as mysqlBoolean, varchar, mysqlTable, decimal as mysqlDecimal, float, index as mysqlIndex } from "drizzle-orm/mysql-core";
import type { DatabaseProvider } from "@ccflare/config";
import { accountsSqlite, accountsPostgreSQL, accountsMySQL } from "./accounts";

// SQLite schema
export const requestsSqlite = sqliteTable('requests', {
	id: text('id').primaryKey(),
	timestamp: integer('timestamp').notNull(),
	method: text('method').notNull(),
	path: text('path').notNull(),
	accountUsed: text('account_used').references(() => accountsSqlite.id),
	statusCode: integer('status_code'),
	success: integer('success'), // SQLite doesn't have boolean, use integer
	errorMessage: text('error_message'),
	responseTimeMs: integer('response_time_ms'),
	failoverAttempts: integer('failover_attempts').default(0),
	model: text('model'),
	promptTokens: integer('prompt_tokens').default(0),
	completionTokens: integer('completion_tokens').default(0),
	totalTokens: integer('total_tokens').default(0),
	costUsd: real('cost_usd').default(0),
	outputTokensPerSecond: real('output_tokens_per_second'),
	inputTokens: integer('input_tokens').default(0),
	cacheReadInputTokens: integer('cache_read_input_tokens').default(0),
	cacheCreationInputTokens: integer('cache_creation_input_tokens').default(0),
	outputTokens: integer('output_tokens').default(0),
	agentUsed: text('agent_used'),
}, (table) => ({
	timestampIdx: index('idx_requests_timestamp').on(desc(table.timestamp)),
	accountUsedIdx: index('idx_requests_account_used').on(table.accountUsed),
	timestampAccountIdx: index('idx_requests_timestamp_account').on(desc(table.timestamp), table.accountUsed),
}));

// PostgreSQL schema
export const requestsPostgreSQL = pgTable('requests', {
	id: uuid('id').primaryKey().defaultRandom(),
	timestamp: timestamp('timestamp').defaultNow().notNull(),
	method: pgText('method').notNull(),
	path: pgText('path').notNull(),
	accountUsed: uuid('account_used').references(() => accountsPostgreSQL.id),
	statusCode: pgInteger('status_code'),
	success: pgBoolean('success'),
	errorMessage: pgText('error_message'),
	responseTimeMs: pgInteger('response_time_ms'),
	failoverAttempts: pgInteger('failover_attempts').default(0),
	model: pgText('model'),
	promptTokens: pgInteger('prompt_tokens').default(0),
	completionTokens: pgInteger('completion_tokens').default(0),
	totalTokens: pgInteger('total_tokens').default(0),
	costUsd: decimal('cost_usd', { precision: 10, scale: 6 }).default('0'),
	outputTokensPerSecond: pgReal('output_tokens_per_second'),
	inputTokens: pgInteger('input_tokens').default(0),
	cacheReadInputTokens: pgInteger('cache_read_input_tokens').default(0),
	cacheCreationInputTokens: pgInteger('cache_creation_input_tokens').default(0),
	outputTokens: pgInteger('output_tokens').default(0),
	agentUsed: pgText('agent_used'),
}, (table) => ({
	timestampIdx: pgIndex('idx_requests_timestamp').on(desc(table.timestamp)),
	accountUsedIdx: pgIndex('idx_requests_account_used').on(table.accountUsed),
	timestampAccountIdx: pgIndex('idx_requests_timestamp_account').on(desc(table.timestamp), table.accountUsed),
}));

// MySQL schema
export const requestsMySQL = mysqlTable('requests', {
	id: varchar('id', { length: 36 }).primaryKey(),
	timestamp: mysqlTimestamp('timestamp').defaultNow().notNull(),
	method: varchar('method', { length: 10 }).notNull(),
	path: mysqlText('path').notNull(),
	accountUsed: varchar('account_used', { length: 36 }).references(() => accountsMySQL.id),
	statusCode: int('status_code'),
	success: mysqlBoolean('success'),
	errorMessage: mysqlText('error_message'),
	responseTimeMs: int('response_time_ms'),
	failoverAttempts: int('failover_attempts').default(0),
	model: varchar('model', { length: 100 }),
	promptTokens: int('prompt_tokens').default(0),
	completionTokens: int('completion_tokens').default(0),
	totalTokens: int('total_tokens').default(0),
	costUsd: mysqlDecimal('cost_usd', { precision: 10, scale: 6 }).default('0'),
	outputTokensPerSecond: float('output_tokens_per_second'),
	inputTokens: int('input_tokens').default(0),
	cacheReadInputTokens: int('cache_read_input_tokens').default(0),
	cacheCreationInputTokens: int('cache_creation_input_tokens').default(0),
	outputTokens: int('output_tokens').default(0),
	agentUsed: varchar('agent_used', { length: 255 }),
}, (table) => ({
	timestampIdx: mysqlIndex('idx_requests_timestamp').on(desc(table.timestamp)),
	accountUsedIdx: mysqlIndex('idx_requests_account_used').on(table.accountUsed),
	timestampAccountIdx: mysqlIndex('idx_requests_timestamp_account').on(desc(table.timestamp), table.accountUsed),
}));

// Helper function to get the correct requests table based on provider
export function getRequestsTable(provider: DatabaseProvider) {
	switch (provider) {
		case 'sqlite':
			return requestsSqlite;
		case 'postgresql':
			return requestsPostgreSQL;
		case 'mysql':
			return requestsMySQL;
		default:
			throw new Error(`Unsupported database provider: ${provider}`);
	}
}
