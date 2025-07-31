import type { Config } from "drizzle-kit";

export default {
	schema: "./src/schema/index.ts",
	out: "./src/migrations/generated-mysql",
	dialect: "mysql",
	dbCredentials: {
		url: process.env.DATABASE_URL || "mysql://localhost:3306/ccflare",
	},
	verbose: true,
	strict: true,
} satisfies Config;
