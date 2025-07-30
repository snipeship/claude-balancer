import { HttpError, parseHttpError } from "@ccflare/errors";

export interface RequestOptions extends RequestInit {
	timeout?: number;
	retries?: number;
	retryDelay?: number;
	baseUrl?: string;
}

export interface ClientOptions {
	baseUrl?: string;
	defaultHeaders?: HeadersInit;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
}

/**
 * Base HTTP client with common functionality
 */
export class HttpClient {
	private options: Required<ClientOptions>;

	constructor(options: ClientOptions = {}) {
		this.options = {
			baseUrl: options.baseUrl || "",
			defaultHeaders: options.defaultHeaders || {},
			timeout: options.timeout || 30000,
			retries: options.retries || 0,
			retryDelay: options.retryDelay || 1000,
		};
	}

	/**
	 * Make an HTTP request with retries and timeout
	 */
	async request<T = unknown>(
		url: string,
		options: RequestOptions = {},
	): Promise<T> {
		const {
			timeout = this.options.timeout,
			retries = this.options.retries,
			retryDelay = this.options.retryDelay,
			baseUrl = this.options.baseUrl,
			...fetchOptions
		} = options;

		const fullUrl = baseUrl ? new URL(url, baseUrl).toString() : url;
		const headers = {
			...this.options.defaultHeaders,
			...fetchOptions.headers,
		};

		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeout);

				const response = await fetch(fullUrl, {
					...fetchOptions,
					headers,
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					const error = await parseHttpError(response);
					throw error;
				}

				const contentType = response.headers.get("content-type");
				if (contentType?.includes("application/json")) {
					return await response.json();
				}

				return (await response.text()) as T;
			} catch (error) {
				lastError = error as Error;

				// Don't retry on client errors (4xx)
				if (error instanceof HttpError && error.status < 500) {
					throw error;
				}

				// Don't retry on abort
				if (error instanceof Error && error.name === "AbortError") {
					throw new HttpError(408, "Request timeout");
				}

				// Retry if we have attempts left
				if (attempt < retries) {
					await this.delay(retryDelay * (attempt + 1));
				}
			}
		}

		throw lastError || new Error("Unknown error");
	}

	/**
	 * Convenience methods
	 */
	get<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
		return this.request<T>(url, { ...options, method: "GET" });
	}

	post<T = unknown>(
		url: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<T> {
		return this.request<T>(url, {
			...options,
			method: "POST",
			body: body ? JSON.stringify(body) : undefined,
			headers: {
				"Content-Type": "application/json",
				...options?.headers,
			},
		});
	}

	put<T = unknown>(
		url: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<T> {
		return this.request<T>(url, {
			...options,
			method: "PUT",
			body: body ? JSON.stringify(body) : undefined,
			headers: {
				"Content-Type": "application/json",
				...options?.headers,
			},
		});
	}

	patch<T = unknown>(
		url: string,
		body?: unknown,
		options?: RequestOptions,
	): Promise<T> {
		return this.request<T>(url, {
			...options,
			method: "PATCH",
			body: body ? JSON.stringify(body) : undefined,
			headers: {
				"Content-Type": "application/json",
				...options?.headers,
			},
		});
	}

	delete<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
		return this.request<T>(url, { ...options, method: "DELETE" });
	}

	/**
	 * Delay helper for retries
	 */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
