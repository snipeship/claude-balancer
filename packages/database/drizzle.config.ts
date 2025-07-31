import type { Config } from "drizzle-kit";

export default {
	schema: "./src/schema/index.ts",
	out: "./src/migrations/generated",
	dialect: "sqlite",
	dbCredentials: {
		url: process.env.DATABASE_URL || "./ccflare.db",
	},
	verbose: true,
	strict: true,
} satisfies Config;
