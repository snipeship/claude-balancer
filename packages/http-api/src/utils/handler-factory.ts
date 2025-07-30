import { errorResponse } from "@ccflare/http-common";
import type { APIContext } from "../types";

export interface HandlerOptions {
	requiresAuth?: boolean;
	method?: string;
}

/**
 * Factory for creating consistent API handlers with error handling
 */
export function createHandler<T extends unknown[], R>(
	handler: (context: APIContext, ...args: T) => R | Promise<R>,
	_options: HandlerOptions = {},
): (...args: T) => Promise<Response> {
	return async (...args: T): Promise<Response> => {
		try {
			// In a real implementation, you'd pass the context here
			// For now, we'll assume it's available through dependency injection
			const result = await handler({} as APIContext, ...args);
			return result as Response;
		} catch (error) {
			return errorResponse(error);
		}
	};
}

/**
 * Helper for parsing and validating request body
 */
export async function parseRequestBody<T>(req: Request): Promise<T> {
	try {
		const body = await req.json();
		return body as T;
	} catch (_error) {
		throw new Error("Invalid JSON in request body");
	}
}

/**
 * Helper for extracting common query parameters
 */
export function extractQueryParams(
	url: URL,
	params: string[],
): Record<string, string | null> {
	const result: Record<string, string | null> = {};
	for (const param of params) {
		result[param] = url.searchParams.get(param);
	}
	return result;
}
