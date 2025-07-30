/**
 * Centralized constants for the ccflare application
 * All magic numbers should be defined here to improve maintainability
 */

// Time constants (all in milliseconds)
export const TIME_CONSTANTS = {
	// Base units
	SECOND: 1000,
	MINUTE: 60 * 1000,
	HOUR: 60 * 60 * 1000,
	DAY: 24 * 60 * 60 * 1000,

	// Session durations
	SESSION_DURATION_DEFAULT: 5 * 60 * 60 * 1000, // 5 hours
	SESSION_DURATION_FALLBACK: 3600000, // 1 hour

	// Timeouts
	STREAM_TIMEOUT_DEFAULT: 1000 * 60 * 1, // 1 minute
	OAUTH_STATE_TTL: 10, // 10 minutes (stored separately as minutes)
	RETRY_DELAY_DEFAULT: 1000, // 1 second

	// Cache durations
	CACHE_YEAR: 31536000, // 365 days in seconds for HTTP cache headers
} as const;

// Buffer sizes (in bytes unless specified)
export const BUFFER_SIZES = {
	// Stream usage buffer size in KB (multiplied by 1024 to get bytes)
	STREAM_USAGE_BUFFER_KB: 64,
	STREAM_USAGE_BUFFER_BYTES: 64 * 1024,

	// Stream body max size
	STREAM_BODY_MAX_KB: 256,
	STREAM_BODY_MAX_BYTES: 256 * 1024, // 256KB default

	// Anthropic provider stream cap
	ANTHROPIC_STREAM_CAP_BYTES: 32768, // 32KB

	// Stream tee default max bytes
	STREAM_TEE_MAX_BYTES: 1024 * 1024, // 1MB

	// Log file size
	LOG_FILE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
} as const;

// Network constants
export const NETWORK = {
	// Ports
	DEFAULT_PORT: 8080,

	// Timeouts
	IDLE_TIMEOUT_MAX: 255, // Max allowed by Bun
} as const;

// Cache control headers
export const CACHE = {
	// HTTP cache control max-age values (in seconds)
	STATIC_ASSETS_MAX_AGE: 31536000, // 1 year
	CACHE_CONTROL_IMMUTABLE: "public, max-age=31536000, immutable",
	CACHE_CONTROL_STATIC: "public, max-age=31536000",
	CACHE_CONTROL_NO_CACHE: "no-cache, no-store, must-revalidate",
} as const;

// Request/Response limits
export const LIMITS = {
	// Request history limits
	REQUEST_HISTORY_DEFAULT: 50,
	REQUEST_DETAILS_DEFAULT: 100,
	REQUEST_HISTORY_MAX: 1000,
	LOG_READ_DEFAULT: 1000,

	// Account name constraints
	ACCOUNT_NAME_MIN_LENGTH: 1,
	ACCOUNT_NAME_MAX_LENGTH: 100,

	// UI formatting
	CONSOLE_SEPARATOR_LENGTH: 100,
	CONSOLE_COLUMN_PADDING: {
		NAME: 20,
		TYPE: 10,
		TIER: 6,
		REQUESTS: 12,
		TOKEN: 10,
		STATUS: 20,
	},
} as const;

// HTTP status codes
export const HTTP_STATUS = {
	OK: 200,
	NOT_FOUND: 404,
	TOO_MANY_REQUESTS: 429,
	INTERNAL_SERVER_ERROR: 500,
	SERVICE_UNAVAILABLE: 503,
} as const;

// Account tiers - removed unused ACCOUNT_TIERS export
// Statistical calculations - removed unused STATS export
