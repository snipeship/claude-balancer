import { sql } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { text as pgText, integer as pgInteger, timestamp, pgTable } from "drizzle-orm/pg-core";
import { text as mysqlText, int, timestamp as mysqlTimestamp, varchar, mysqlTable } from "drizzle-orm/mysql-core";
import type { DatabaseProvider } from "@ccflare/config";

// SQLite schema
export const strategiesSqlite = sqliteTable('strategies', {
	name: text('name').primaryKey(),
	config: text('config').notNull(), // JSON string
	updatedAt: integer('updated_at').notNull(),
});

// PostgreSQL schema
export const strategiesPostgreSQL = pgTable('strategies', {
	name: pgText('name').primaryKey(),
	config: pgText('config').notNull(), // JSON string
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// MySQL schema
export const strategiesMySQL = mysqlTable('strategies', {
	name: varchar('name', { length: 255 }).primaryKey(),
	config: mysqlText('config').notNull(), // JSON string
	updatedAt: mysqlTimestamp('updated_at').defaultNow().notNull(),
});

// Helper function to get the correct strategies table based on provider
export function getStrategiesTable(provider: DatabaseProvider) {
	switch (provider) {
		case 'sqlite':
			return strategiesSqlite;
		case 'postgresql':
			return strategiesPostgreSQL;
		case 'mysql':
			return strategiesMySQL;
		default:
			throw new Error(`Unsupported database provider: ${provider}`);
	}
}
