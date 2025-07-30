import type { Database } from "bun:sqlite";

type QueryParams = Array<string | number | boolean | null | Buffer>;

export abstract class BaseRepository<_T> {
	constructor(protected db: Database) {}

	protected query<R>(sql: string, params: QueryParams = []): R[] {
		return this.db.query<R, QueryParams>(sql).all(...params) as R[];
	}

	protected get<R>(sql: string, params: QueryParams = []): R | null {
		const result = this.db.query<R, QueryParams>(sql).get(...params);
		return result as R | null;
	}

	protected run(sql: string, params: QueryParams = []): void {
		this.db.run(sql, params);
	}

	protected runWithChanges(sql: string, params: QueryParams = []): number {
		const result = this.db.run(sql, params);
		return result.changes;
	}
}
