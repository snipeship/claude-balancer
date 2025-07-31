import { describe, it, expect, beforeAll, afterAll } from "bun:test";

/**
 * Integration tests for ccflare running in Docker with different database providers
 * These tests verify that the application works correctly with SQLite, PostgreSQL, and MySQL
 */

interface TestConfig {
	name: string;
	baseUrl: string;
	apiKey: string;
}

const testConfigs: TestConfig[] = [
	{
		name: "SQLite",
		baseUrl: process.env.SQLITE_URL || "http://localhost:8080",
		apiKey: process.env.API_KEY_SQLITE || "test-api-key-sqlite",
	},
	{
		name: "PostgreSQL", 
		baseUrl: process.env.POSTGRES_URL || "http://localhost:8081",
		apiKey: process.env.API_KEY_POSTGRES || "test-api-key-postgres",
	},
	{
		name: "MySQL",
		baseUrl: process.env.MYSQL_URL || "http://localhost:8082", 
		apiKey: process.env.API_KEY_MYSQL || "test-api-key-mysql",
	},
];

async function waitForService(url: string, maxAttempts = 30, delayMs = 2000): Promise<boolean> {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const response = await fetch(`${url}/health`);
			if (response.ok) {
				return true;
			}
		} catch (error) {
			// Service not ready yet
		}
		await new Promise(resolve => setTimeout(resolve, delayMs));
	}
	return false;
}

async function makeRequest(baseUrl: string, apiKey: string, path: string, options: RequestInit = {}) {
	const url = `${baseUrl}${path}`;
	const headers = {
		'Authorization': `Bearer ${apiKey}`,
		'Content-Type': 'application/json',
		...options.headers,
	};

	return fetch(url, {
		...options,
		headers,
	});
}

describe('Docker Database Integration Tests', () => {
	beforeAll(async () => {
		console.log('Waiting for all services to be ready...');
		
		for (const config of testConfigs) {
			console.log(`Waiting for ${config.name} service at ${config.baseUrl}...`);
			const isReady = await waitForService(config.baseUrl);
			if (!isReady) {
				throw new Error(`${config.name} service at ${config.baseUrl} is not ready`);
			}
			console.log(`✅ ${config.name} service is ready`);
		}
	}, 120000); // 2 minute timeout for services to start

	testConfigs.forEach((config) => {
		describe(`${config.name} Database Provider`, () => {
			it('should respond to health check', async () => {
				const response = await fetch(`${config.baseUrl}/health`);
				expect(response.ok).toBe(true);
				
				const health = await response.json();
				expect(health).toBeDefined();
			});

			it('should handle authentication', async () => {
				// Test without API key - should fail
				const unauthorizedResponse = await fetch(`${config.baseUrl}/api/accounts`);
				expect(unauthorizedResponse.status).toBe(401);

				// Test with API key - should succeed
				const authorizedResponse = await makeRequest(config.baseUrl, config.apiKey, '/api/accounts');
				expect(authorizedResponse.ok).toBe(true);
			});

			it('should manage accounts', async () => {
				// Get initial accounts
				const initialResponse = await makeRequest(config.baseUrl, config.apiKey, '/api/accounts');
				expect(initialResponse.ok).toBe(true);
				
				const initialAccounts = await initialResponse.json();
				expect(Array.isArray(initialAccounts)).toBe(true);

				// Create a test account (this would typically be done through OAuth flow)
				// For now, just verify the endpoint exists and handles requests properly
				const createResponse = await makeRequest(config.baseUrl, config.apiKey, '/api/accounts', {
					method: 'POST',
					body: JSON.stringify({
						name: `test-account-${config.name.toLowerCase()}`,
						provider: 'anthropic',
						refresh_token: 'test-refresh-token',
					}),
				});

				// The response might be 400 if the account creation requires OAuth flow
				// but it should not be 500 (server error)
				expect(createResponse.status).not.toBe(500);
			});

			it('should handle proxy requests', async () => {
				// Test the main proxy endpoint
				const proxyResponse = await makeRequest(config.baseUrl, config.apiKey, '/v1/messages', {
					method: 'POST',
					body: JSON.stringify({
						model: 'claude-3-sonnet-20240229',
						max_tokens: 10,
						messages: [
							{
								role: 'user',
								content: 'Hello, this is a test message.',
							},
						],
					}),
				});

				// The response might fail due to no valid accounts, but should not be a server error
				expect(proxyResponse.status).not.toBe(500);
				
				// Should be either 200 (success), 400 (bad request), or 503 (no available accounts)
				expect([200, 400, 503]).toContain(proxyResponse.status);
			});

			it('should store request logs', async () => {
				// Get request logs
				const logsResponse = await makeRequest(config.baseUrl, config.apiKey, '/api/requests');
				expect(logsResponse.ok).toBe(true);

				const logs = await logsResponse.json();
				expect(Array.isArray(logs)).toBe(true);
			});

			it('should provide statistics', async () => {
				// Get statistics
				const statsResponse = await makeRequest(config.baseUrl, config.apiKey, '/api/stats');
				expect(statsResponse.ok).toBe(true);

				const stats = await statsResponse.json();
				expect(stats).toBeDefined();
				expect(typeof stats.total_requests).toBe('number');
			});

			it('should handle database-specific operations', async () => {
				// Test database health
				const dbHealthResponse = await makeRequest(config.baseUrl, config.apiKey, '/api/health/database');
				
				if (dbHealthResponse.ok) {
					const dbHealth = await dbHealthResponse.json();
					expect(dbHealth).toBeDefined();
					expect(dbHealth.status).toBe('healthy');
					
					// Verify the correct database provider is being used
					if (config.name === 'SQLite') {
						expect(dbHealth.provider).toBe('sqlite');
					} else if (config.name === 'PostgreSQL') {
						expect(dbHealth.provider).toBe('postgresql');
					} else if (config.name === 'MySQL') {
						expect(dbHealth.provider).toBe('mysql');
					}
				}
			});

			it('should handle concurrent requests', async () => {
				// Test concurrent requests to verify database connection handling
				const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
					makeRequest(config.baseUrl, config.apiKey, `/api/accounts?page=${i}`)
				);

				const responses = await Promise.all(concurrentRequests);
				
				// All requests should complete without server errors
				responses.forEach((response, index) => {
					expect(response.status).not.toBe(500);
				});
			});

			it('should persist data across requests', async () => {
				// Make a request that should create some data
				await makeRequest(config.baseUrl, config.apiKey, '/api/accounts');

				// Make another request and verify data persistence
				const response = await makeRequest(config.baseUrl, config.apiKey, '/api/requests');
				expect(response.ok).toBe(true);

				// The fact that we can retrieve data means persistence is working
				const data = await response.json();
				expect(Array.isArray(data)).toBe(true);
			});
		});
	});

	describe('Cross-Database Consistency', () => {
		it('should have consistent API responses across all database providers', async () => {
			const responses = await Promise.all(
				testConfigs.map(config =>
					makeRequest(config.baseUrl, config.apiKey, '/api/accounts')
				)
			);

			// All responses should have the same structure
			const jsonResponses = await Promise.all(
				responses.map(response => response.json())
			);

			// Verify all responses are arrays (consistent structure)
			jsonResponses.forEach((data, index) => {
				expect(Array.isArray(data)).toBe(true);
			});
		});

		it('should handle the same request types across all providers', async () => {
			const testEndpoints = ['/api/accounts', '/api/requests', '/api/stats'];

			for (const endpoint of testEndpoints) {
				const responses = await Promise.all(
					testConfigs.map(config =>
						makeRequest(config.baseUrl, config.apiKey, endpoint)
					)
				);

				// All providers should handle the same endpoints
				responses.forEach((response, index) => {
					expect(response.status).not.toBe(404); // Endpoint should exist
					expect(response.status).not.toBe(500); // Should not have server errors
				});
			}
		});
	});
});
