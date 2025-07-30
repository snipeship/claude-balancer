/**
 * Sanitizes proxy headers by removing hop-by-hop headers that should not be forwarded
 * after Bun has automatically decompressed the response body.
 *
 * Removes: content-encoding, content-length, transfer-encoding
 */
export function sanitizeProxyHeaders(original: Headers): Headers {
	const sanitized = new Headers(original);

	// Remove headers that are invalidated by automatic decompression
	sanitized.delete("content-encoding");
	sanitized.delete("content-length");
	sanitized.delete("transfer-encoding");

	return sanitized;
}
