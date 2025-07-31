import type { Config } from "drizzle-kit";

export default {
	schema: "./src/schema/index.ts",
	out: "./src/migrations/generated-postgresql",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL || "postgresql://localhost:5432/ccflare",
	},
	verbose: true,
	strict: true,
} satisfies Config;
