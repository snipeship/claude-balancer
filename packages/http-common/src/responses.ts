import { HttpError } from "./errors";

/**
 * Create a JSON response with proper headers
 */
export function jsonResponse(
	data: unknown,
	status = 200,
	headers?: HeadersInit,
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	});
}

/**
 * Create an error response from any error type
 */
export function errorResponse(error: unknown): Response {
	if (error instanceof HttpError) {
		const body: { error: string; details?: unknown } = {
			error: error.message,
		};
		if (error.details !== undefined) {
			body.details = error.details;
		}
		return jsonResponse(body, error.status);
	}

	// Handle generic errors
	const message =
		error instanceof Error ? error.message : "Internal server error";
	const status = 500;

	// In browser context, we can't log to files
	// Server-side code should handle logging before calling errorResponse
	if (typeof console !== "undefined" && console.error) {
		console.error("Unhandled error:", error);
	}

	return jsonResponse({ error: message }, status);
}

/**
 * Create a success response with optional data
 */
export function successResponse(
	data?: unknown,
	message = "Success",
	status = 200,
): Response {
	return jsonResponse({ message, data }, status);
}

/**
 * Create a paginated response
 */
export function paginatedResponse<T>(
	items: T[],
	page: number,
	perPage: number,
	total: number,
	headers?: HeadersInit,
): Response {
	const totalPages = Math.ceil(total / perPage);

	return jsonResponse(
		{
			items,
			pagination: {
				page,
				perPage,
				total,
				totalPages,
				hasNext: page < totalPages,
				hasPrev: page > 1,
			},
		},
		200,
		headers,
	);
}

/**
 * Create a streaming response for Server-Sent Events
 */
export function sseResponse(
	stream: ReadableStream,
	headers?: HeadersInit,
): Response {
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			...headers,
		},
	});
}
