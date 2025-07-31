import { sql } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { text as pgText, integer as pgInteger, timestamp, uuid, pgTable } from "drizzle-orm/pg-core";
import { text as mysqlText, int, timestamp as mysqlTimestamp, varchar, mysqlTable } from "drizzle-orm/mysql-core";
import type { DatabaseProvider } from "@ccflare/config";

// SQLite schema
export const agentPreferencesSqlite = sqliteTable('agent_preferences', {
	agentId: text('agent_id').primaryKey(),
	model: text('model').notNull(),
	updatedAt: integer('updated_at').notNull(),
});

// PostgreSQL schema
export const agentPreferencesPostgreSQL = pgTable('agent_preferences', {
	agentId: pgText('agent_id').primaryKey(),
	model: pgText('model').notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// MySQL schema
export const agentPreferencesMySQL = mysqlTable('agent_preferences', {
	agentId: varchar('agent_id', { length: 255 }).primaryKey(),
	model: varchar('model', { length: 100 }).notNull(),
	updatedAt: mysqlTimestamp('updated_at').defaultNow().notNull(),
});

// Helper function to get the correct agent_preferences table based on provider
export function getAgentPreferencesTable(provider: DatabaseProvider) {
	switch (provider) {
		case 'sqlite':
			return agentPreferencesSqlite;
		case 'postgresql':
			return agentPreferencesPostgreSQL;
		case 'mysql':
			return agentPreferencesMySQL;
		default:
			throw new Error(`Unsupported database provider: ${provider}`);
	}
}
