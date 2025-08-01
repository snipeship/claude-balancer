import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { DatabaseProvider } from "@ccflare/config";
import type { Account } from "@ccflare/types";
import type { DatabaseConnection, DatabaseConnectionConfig } from "../providers/database-provider";
import { DatabaseProviderFactory } from "../providers/database-factory";
import { DrizzleAccountRepository } from "../repositories/drizzle-account.repository";
import { DrizzleOAuthRepository } from "../repositories/drizzle-oauth.repository";
import { createInitialSchema } from "../migrations/drizzle-migrations";
import { SchemaValidator } from "../validation/schema-validator";
import { randomUUID } from "crypto";

/**
 * Test configuration for different database providers
 */
const testConfigs: Record<DatabaseProvider, DatabaseConnectionConfig> = {
	sqlite: {
		provider: 'sqlite',
		dbPath: ':memory:', // In-memory SQLite for testing
		walMode: false, // Disable WAL for in-memory databases
	},
	postgresql: {
		provider: 'postgresql',
		url: process.env.TEST_POSTGRES_URL || 'postgresql://test:test@localhost:5432/ccflare_test',
	},
	mysql: {
		provider: 'mysql',
		url: process.env.TEST_MYSQL_URL || 'mysql://test:test@localhost:3306/ccflare_test',
	},
};

/**
 * Helper function to create test account data with all required properties
 */
function createTestAccount(overrides: Partial<Omit<Account, 'id'>> = {}): Omit<Account, 'id'> {
	return {
		name: 'test-account',
		provider: 'anthropic',
		api_key: null,
		refresh_token: 'test-refresh-token',
		access_token: null,
		expires_at: null,
		request_count: 0,
		total_requests: 0,
		last_used: null,
		created_at: Date.now(),
		rate_limited_until: null,
		session_start: null,
		session_request_count: 0,
		account_tier: 1,
		paused: false,
		rate_limit_reset: null,
		rate_limit_status: null,
		rate_limit_remaining: null,
		...overrides,
	};
}

/**
 * Test suite that runs against all database providers
 */
describe('Database Provider Tests', () => {
	// Determine which providers to test based on environment variables
	const getProvidersToTest = (): DatabaseProvider[] => {
		// If specific provider is requested via environment variable
		if (process.env.TEST_PROVIDER) {
			const requestedProvider = process.env.TEST_PROVIDER as DatabaseProvider;
			if (['sqlite', 'postgresql', 'mysql'].includes(requestedProvider)) {
				return [requestedProvider];
			}
		}

		// Otherwise, test all available providers
		const providers: DatabaseProvider[] = ['sqlite']; // Always include SQLite

		// Add PostgreSQL if test database is available
		if (process.env.TEST_POSTGRES_URL) {
			providers.push('postgresql');
		}

		// Add MySQL if test database is available
		if (process.env.TEST_MYSQL_URL) {
			providers.push('mysql');
		}

		return providers;
	};

	const providers = getProvidersToTest();

	providers.forEach((provider) => {
		describe(`${provider.toUpperCase()} Provider`, () => {
			let connection: DatabaseConnection;
			let accountRepo: DrizzleAccountRepository;
			let oauthRepo: DrizzleOAuthRepository;

			beforeEach(async () => {
				const config = testConfigs[provider];
				
				// Validate configuration
				DatabaseProviderFactory.validateConfig(config);
				
				// Create connection
				connection = DatabaseProviderFactory.createConnection(config);
				
				// Initialize schema
				await createInitialSchema(connection, provider);
				
				// Initialize repositories
				accountRepo = new DrizzleAccountRepository(connection, provider);
				oauthRepo = new DrizzleOAuthRepository(connection, provider);
			});

			afterEach(async () => {
				if (connection) {
					// Clean up test data before closing connection
					try {
						// Clear all tables in reverse dependency order
						await connection.run('DELETE FROM request_payloads', []);
						await connection.run('DELETE FROM requests', []);
						await connection.run('DELETE FROM oauth_sessions', []);
						await connection.run('DELETE FROM accounts', []);
						await connection.run('DELETE FROM strategies', []);
						await connection.run('DELETE FROM agent_preferences', []);
					} catch (error) {
						// Ignore cleanup errors - tables might not exist
						console.warn(`Cleanup warning for ${provider}:`, error);
					}

					await connection.close();
				}
			});

			describe('Connection and Schema', () => {
				it('should create a valid database connection', async () => {
					expect(connection).toBeDefined();
					expect(connection.getProvider()).toBe(provider);
				});

				it('should validate schema successfully', async () => {
					const validator = new SchemaValidator();
					const result = await validator.validateSchema(connection, provider);

					expect(result.isValid).toBe(true);
					expect(result.errors).toHaveLength(0);
					expect(result.missingTables).toHaveLength(0);
				});

				it('should execute basic queries', async () => {
					// Test basic connectivity with a simple query
					const result = await connection.get('SELECT 1 as test');
					expect(result).toBeDefined();
				});

				it('should handle invalid SQL gracefully', async () => {
					try {
						await connection.query('INVALID SQL STATEMENT');
						expect(true).toBe(false); // Should not reach here
					} catch (error) {
						expect(error).toBeDefined();
					}
				});

				it('should support concurrent connections', async () => {
					// Test multiple simultaneous queries
					const promises = Array.from({ length: 5 }, (_, i) =>
						connection.get(`SELECT ${i + 1} as test_${i}`)
					);

					const results = await Promise.all(promises);
					expect(results).toHaveLength(5);
					results.forEach((result) => {
						expect(result).toBeDefined();
					});
				});
			});

			describe('Account Repository', () => {
				it('should create and retrieve accounts', async () => {
					const accountData = createTestAccount({
						name: 'test-account',
						refresh_token: 'test-refresh-token',
						account_tier: 1,
					});

					const account = await accountRepo.create(accountData);
					expect(account).toBeDefined();
					expect(account.name).toBe(accountData.name);
					expect(account.id).toBeDefined();

					const retrieved = await accountRepo.findById(account.id);
					expect(retrieved).toBeDefined();
					expect(retrieved?.name).toBe(accountData.name);
				});

				it('should update account properties', async () => {
					const account = await accountRepo.create(createTestAccount({
						name: 'update-test',
						refresh_token: 'test-token',
					}));

					const updated = await accountRepo.update(account.id, {
						request_count: 5,
						paused: true,
					});

					expect(updated).toBeDefined();
					expect(updated?.request_count).toBe(5);
					expect(updated?.paused).toBe(true);
				});

				it('should delete accounts', async () => {
					const account = await accountRepo.create(createTestAccount({
						name: 'delete-test',
						refresh_token: 'test-token',
					}));

					const deleted = await accountRepo.delete(account.id);
					expect(deleted).toBe(true);

					const retrieved = await accountRepo.findById(account.id);
					expect(retrieved).toBeNull();
				});

				it('should find accounts by name', async () => {
					const accountName = 'find-by-name-test';
					await accountRepo.create(createTestAccount({
						name: accountName,
						refresh_token: 'test-token',
					}));

					const found = await accountRepo.findByName(accountName);
					expect(found).toBeDefined();
					expect(found?.name).toBe(accountName);
				});

				it('should get available accounts', async () => {
					// Create a paused account
					await accountRepo.create(createTestAccount({
						name: 'paused-account',
						refresh_token: 'test-token',
						paused: true,
					}));

					// Create an available account
					await accountRepo.create(createTestAccount({
						name: 'available-account',
						refresh_token: 'test-token',
						paused: false,
					}));

					const available = await accountRepo.getAvailableAccounts();
					expect(available).toBeDefined();
					expect(available.length).toBeGreaterThan(0);

					// Should not include paused accounts
					const pausedAccount = available.find(acc => acc.name === 'paused-account');
					expect(pausedAccount).toBeUndefined();
				});

				it('should handle duplicate account names', async () => {
					const accountData = createTestAccount({
						name: 'duplicate-test',
						refresh_token: 'test-token',
					});

					await accountRepo.create(accountData);

					// Should throw error on duplicate name
					try {
						await accountRepo.create(accountData);
						expect(true).toBe(false); // Should not reach here
					} catch (error) {
						expect(error).toBeDefined();
					}
				});

				it('should handle invalid account IDs', async () => {
					const result = await accountRepo.findById('non-existent-id');
					expect(result).toBeNull();

					const deleteResult = await accountRepo.delete('non-existent-id');
					expect(deleteResult).toBe(false);
				});

				it('should validate required fields', async () => {
					// Should throw error when missing required fields
					try {
						await accountRepo.create({} as any);
						expect(true).toBe(false); // Should not reach here
					} catch (error) {
						expect(error).toBeDefined();
					}
				});
			});

			describe('OAuth Repository', () => {
				it('should create and retrieve OAuth sessions', async () => {
					const sessionId = provider === 'postgresql' ? randomUUID() : 'test-session-123';
					const sessionData = {
						accountName: 'test-account',
						verifier: 'test-verifier',
						mode: 'console' as const,
						tier: 1,
					};

					await oauthRepo.createSession(
						sessionId,
						sessionData.accountName,
						sessionData.verifier,
						sessionData.mode,
						sessionData.tier,
						10 // 10 minutes TTL
					);

					const session = await oauthRepo.getSession(sessionId);
					expect(session).toBeDefined();
					expect(session?.accountName).toBe(sessionData.accountName);
					expect(session?.verifier).toBe(sessionData.verifier);
				});

				it('should delete OAuth sessions', async () => {
					const sessionId = provider === 'postgresql' ? randomUUID() : 'delete-session-123';
					
					await oauthRepo.createSession(
						sessionId,
						'test-account',
						'test-verifier',
						'console',
						1
					);

					const deleted = await oauthRepo.deleteSession(sessionId);
					expect(deleted).toBe(true);

					const session = await oauthRepo.getSession(sessionId);
					expect(session).toBeNull();
				});

				it('should cleanup expired sessions', async () => {
					const sessionId = provider === 'postgresql' ? randomUUID() : 'expired-session-123';
					
					// Create session with very short TTL
					await oauthRepo.createSession(
						sessionId,
						'test-account',
						'test-verifier',
						'console',
						1,
						0.001 // Very short TTL (0.001 minutes = 0.06 seconds)
					);

					// Wait for expiration
					await new Promise(resolve => setTimeout(resolve, 100));

					const cleanedUp = await oauthRepo.cleanupExpiredSessions();
					expect(cleanedUp).toBeGreaterThanOrEqual(1);

					const session = await oauthRepo.getSession(sessionId);
					expect(session).toBeNull();
				});
			});

			describe('Transaction Support', () => {
				it('should support transactions', async () => {
					await connection.beginTransaction();
					
					try {
						await accountRepo.create(createTestAccount({
							name: 'transaction-test',
							refresh_token: 'test-token',
						}));

						await connection.rollback();

						// Account should not exist after rollback
						const account = await accountRepo.findByName('transaction-test');
						expect(account).toBeNull();
					} catch (error) {
						await connection.rollback();
						throw error;
					}
				});

				it('should commit transactions', async () => {
					await connection.beginTransaction();
					
					try {
						const account = await accountRepo.create(createTestAccount({
							name: 'commit-test',
							refresh_token: 'test-token',
						}));

						await connection.commit();

						// Account should exist after commit
						const retrieved = await accountRepo.findById(account.id);
						expect(retrieved).toBeDefined();
						expect(retrieved?.name).toBe('commit-test');
					} catch (error) {
						await connection.rollback();
						throw error;
					}
				});
			});
		});
	});
});

/**
 * Provider-specific tests
 */
describe('Provider-Specific Features', () => {
	describe('SQLite Provider', () => {
		it('should handle boolean values correctly', async () => {
			const config = testConfigs.sqlite;
			const connection = DatabaseProviderFactory.createConnection(config);
			
			try {
				await createInitialSchema(connection, 'sqlite');
				const accountRepo = new DrizzleAccountRepository(connection, 'sqlite');

				const account = await accountRepo.create(createTestAccount({
					name: 'boolean-test',
					refresh_token: 'test-token',
					paused: true,
				}));

				expect(account.paused).toBe(true);

				await accountRepo.setPaused(account.id, false);
				const updated = await accountRepo.findById(account.id);
				expect(updated?.paused).toBe(false);
			} finally {
				await connection.close();
			}
		});
	});

	// Add PostgreSQL and MySQL specific tests when available
	if (process.env.TEST_POSTGRES_URL) {
		describe('PostgreSQL Provider', () => {
			it('should handle UUID primary keys', async () => {
				const config = testConfigs.postgresql;
				const connection = DatabaseProviderFactory.createConnection(config);
				
				try {
					await createInitialSchema(connection, 'postgresql');
					const accountRepo = new DrizzleAccountRepository(connection, 'postgresql');

					const account = await accountRepo.create(createTestAccount({
						name: 'uuid-test',
						refresh_token: 'test-token',
					}));

					// PostgreSQL should generate UUID
					expect(account.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
				} finally {
					await connection.close();
				}
			});
		});
	}
});
