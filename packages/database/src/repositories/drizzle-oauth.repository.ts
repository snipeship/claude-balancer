import { eq, lte, and, gt } from "drizzle-orm";
import type { DatabaseConnection } from "../providers/database-provider";
import type { DatabaseProvider } from "@ccflare/config";
import { DrizzleBaseRepository } from "./drizzle-base.repository";
import { getOAuthSessionsTable } from "../schema/oauth-sessions";

export interface OAuthSession {
	accountName: string;
	verifier: string;
	mode: "console" | "max";
	tier: number;
}

export class DrizzleOAuthRepository extends DrizzleBaseRepository<OAuthSession> {
	constructor(connection: DatabaseConnection, provider: DatabaseProvider) {
		super(connection, provider);
	}

	async createSession(
		sessionId: string,
		accountName: string,
		verifier: string,
		mode: "console" | "max",
		tier: number,
		ttlMinutes = 10,
	): Promise<void> {
		const oauthSessionsTable = getOAuthSessionsTable(this.provider);
		const now = this.getTimestamp();
		const expiresAt = this.provider === 'sqlite'
			? (Date.now() + ttlMinutes * 60 * 1000)  // SQLite: integer timestamp
			: new Date(Date.now() + ttlMinutes * 60 * 1000);  // PostgreSQL/MySQL: Date object

		await (this.db as any).insert(oauthSessionsTable).values({
			id: sessionId,
			accountName: accountName,
			verifier: verifier,
			mode: mode,
			tier: tier,
			createdAt: now,
			expiresAt: expiresAt,
		});
	}

	async getSession(sessionId: string): Promise<OAuthSession | null> {
		const oauthSessionsTable = getOAuthSessionsTable(this.provider);
		const now = this.getTimestamp();

		const rows = await (this.db as any)
			.select()
			.from(oauthSessionsTable)
			.where(
				and(
					eq(oauthSessionsTable.id, sessionId),
					gt(oauthSessionsTable.expiresAt, now)
				)
			)
			.limit(1);

		if (rows.length === 0) return null;

		const row = rows[0];

		// Validate mode field
		if (row.mode !== "console" && row.mode !== "max") {
			console.error(`Invalid mode "${row.mode}" for session ${sessionId}`);
			return null;
		}

		return {
			accountName: row.accountName,
			verifier: row.verifier,
			mode: row.mode,
			tier: row.tier,
		};
	}

	async deleteSession(sessionId: string): Promise<boolean> {
		const oauthSessionsTable = getOAuthSessionsTable(this.provider);

		const result = await (this.db as any)
			.delete(oauthSessionsTable)
			.where(eq(oauthSessionsTable.id, sessionId));

		return result.changes > 0;
	}

	async cleanupExpiredSessions(): Promise<number> {
		const oauthSessionsTable = getOAuthSessionsTable(this.provider);
		const now = this.getTimestamp();

		let result;
		if (this.provider === 'sqlite') {
			// SQLite uses integer timestamps - delete sessions where expires_at <= now
			result = await (this.db as any)
				.delete(oauthSessionsTable)
				.where(lte(oauthSessionsTable.expiresAt, now));
		} else {
			// PostgreSQL and MySQL use Date objects - delete sessions where expires_at <= now
			result = await (this.db as any)
				.delete(oauthSessionsTable)
				.where(lte(oauthSessionsTable.expiresAt, new Date()));
		}

		return result.changes || 0;
	}
}
