import {
	type ErrorFormatterOptions,
	type ErrorType,
	formatError as formatErrorFromPackage,
	getErrorType,
	isAuthError as isAuthErrorCheck,
	isNetworkError as isNetworkErrorCheck,
	isRateLimitError as isRateLimitErrorCheck,
} from "@ccflare/errors";
import { useCallback, useMemo } from "react";

export interface UseApiErrorOptions extends ErrorFormatterOptions {
	/**
	 * Whether to log errors to console
	 * @default false
	 */
	logErrors?: boolean;
}

export interface UseApiErrorReturn {
	/**
	 * Format an error into a user-friendly message
	 */
	formatError: (error: unknown) => string;
	/**
	 * Check if an error is a network error
	 */
	isNetworkError: (error: unknown) => boolean;
	/**
	 * Check if an error is an authentication error
	 */
	isAuthError: (error: unknown) => boolean;
	/**
	 * Check if an error is a rate limit error
	 */
	isRateLimitError: (error: unknown) => boolean;
	/**
	 * Get error type
	 */
	getErrorType: (error: unknown) => ErrorType;
}

/**
 * Hook for consistent error handling across the dashboard
 *
 * @example
 * ```tsx
 * const { formatError, isNetworkError } = useApiError({
 *   errorMap: {
 *     "Network Error": "Unable to connect to the server. Please check your connection.",
 *   }
 * });
 *
 * try {
 *   await api.getAccounts();
 * } catch (err) {
 *   const message = formatError(err);
 *   setError(message);
 * }
 * ```
 */
export function useApiError(
	options: UseApiErrorOptions = {},
): UseApiErrorReturn {
	const { logErrors = false, ...formatOptions } = options;

	// Memoize formatOptions to avoid re-creating on every render
	const memoizedFormatOptions = useMemo(
		() => ({
			...formatOptions,
			errorMap: {
				...formatOptions.errorMap,
				// Override auth error message for dashboard context
				unauthorized: "Authentication failed. Please re-add your account.",
				401: "Authentication failed. Please re-add your account.",
			},
		}),
		// biome-ignore lint/correctness/useExhaustiveDependencies: formatOptions is destructured from options
		[formatOptions],
	);

	const formatError = useCallback(
		(error: unknown): string => {
			if (logErrors) {
				console.error("[API Error]", error);
			}

			// Use the formatError from the errors package with custom auth message
			return formatErrorFromPackage(error, memoizedFormatOptions);
		},
		[logErrors, memoizedFormatOptions],
	);

	const isNetworkError = useCallback((error: unknown): boolean => {
		return isNetworkErrorCheck(error);
	}, []);

	const isAuthError = useCallback((error: unknown): boolean => {
		return isAuthErrorCheck(error);
	}, []);

	const isRateLimitError = useCallback((error: unknown): boolean => {
		return isRateLimitErrorCheck(error);
	}, []);

	const getErrorTypeWrapper = useCallback((error: unknown): ErrorType => {
		return getErrorType(error);
	}, []);

	return useMemo(
		() => ({
			formatError,
			isNetworkError,
			isAuthError,
			isRateLimitError,
			getErrorType: getErrorTypeWrapper,
		}),
		[
			formatError,
			isNetworkError,
			isAuthError,
			isRateLimitError,
			getErrorTypeWrapper,
		],
	);
}
