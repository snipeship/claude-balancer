/**
 * Input validation and sanitization utilities
 */
import { ValidationError } from "./errors";

/**
 * Validates and sanitizes a string input
 */
export function validateString(
	value: unknown,
	field: string,
	options: {
		required?: boolean;
		minLength?: number;
		maxLength?: number;
		pattern?: RegExp;
		allowedValues?: readonly string[];
		transform?: (value: string) => string;
	} = {},
): string | undefined {
	// Handle undefined/null
	if (value === undefined || value === null) {
		if (options.required) {
			throw new ValidationError(`${field} is required`, field);
		}
		return undefined;
	}

	// Ensure it's a string
	if (typeof value !== "string") {
		throw new ValidationError(`${field} must be a string`, field, value);
	}

	// Apply transformation if provided
	const sanitized = options.transform ? options.transform(value) : value;

	// Validate length
	if (options.minLength !== undefined && sanitized.length < options.minLength) {
		throw new ValidationError(
			`${field} must be at least ${options.minLength} characters long`,
			field,
			value,
		);
	}

	if (options.maxLength !== undefined && sanitized.length > options.maxLength) {
		throw new ValidationError(
			`${field} must be at most ${options.maxLength} characters long`,
			field,
			value,
		);
	}

	// Validate pattern
	if (options.pattern && !options.pattern.test(sanitized)) {
		throw new ValidationError(`${field} has an invalid format`, field, value);
	}

	// Validate allowed values
	if (options.allowedValues && !options.allowedValues.includes(sanitized)) {
		throw new ValidationError(
			`${field} must be one of: ${options.allowedValues.join(", ")}`,
			field,
			value,
		);
	}

	return sanitized;
}

/**
 * Validates and sanitizes a number input
 */
export function validateNumber(
	value: unknown,
	field: string,
	options: {
		required?: boolean;
		min?: number;
		max?: number;
		integer?: boolean;
		allowedValues?: readonly number[];
	} = {},
): number | undefined {
	// Handle undefined/null
	if (value === undefined || value === null) {
		if (options.required) {
			throw new ValidationError(`${field} is required`, field);
		}
		return undefined;
	}

	// Convert string to number if needed
	let num: number;
	if (typeof value === "string") {
		num = Number(value);
		if (Number.isNaN(num)) {
			throw new ValidationError(
				`${field} must be a valid number`,
				field,
				value,
			);
		}
	} else if (typeof value === "number") {
		num = value;
	} else {
		throw new ValidationError(`${field} must be a number`, field, value);
	}

	// Validate integer
	if (options.integer && !Number.isInteger(num)) {
		throw new ValidationError(`${field} must be an integer`, field, value);
	}

	// Validate range
	if (options.min !== undefined && num < options.min) {
		throw new ValidationError(
			`${field} must be at least ${options.min}`,
			field,
			value,
		);
	}

	if (options.max !== undefined && num > options.max) {
		throw new ValidationError(
			`${field} must be at most ${options.max}`,
			field,
			value,
		);
	}

	// Validate allowed values
	if (options.allowedValues && !options.allowedValues.includes(num)) {
		throw new ValidationError(
			`${field} must be one of: ${options.allowedValues.join(", ")}`,
			field,
			value,
		);
	}

	return num;
}

/**
 * Validates and sanitizes a boolean input
 */
export function validateBoolean(
	value: unknown,
	field: string,
	options: { required?: boolean } = {},
): boolean | undefined {
	// Handle undefined/null
	if (value === undefined || value === null) {
		if (options.required) {
			throw new ValidationError(`${field} is required`, field);
		}
		return undefined;
	}

	// Handle boolean
	if (typeof value === "boolean") {
		return value;
	}

	// Handle string booleans
	if (typeof value === "string") {
		const lower = value.toLowerCase();
		if (lower === "true" || lower === "1" || lower === "yes") {
			return true;
		}
		if (lower === "false" || lower === "0" || lower === "no") {
			return false;
		}
	}

	// Handle numbers
	if (typeof value === "number") {
		return value !== 0;
	}

	throw new ValidationError(`${field} must be a boolean`, field, value);
}

/**
 * Validates and sanitizes an array input
 */
export function validateArray<T>(
	value: unknown,
	field: string,
	options: {
		required?: boolean;
		minLength?: number;
		maxLength?: number;
		itemValidator?: (item: unknown, index: number) => T;
	} = {},
): T[] | undefined {
	// Handle undefined/null
	if (value === undefined || value === null) {
		if (options.required) {
			throw new ValidationError(`${field} is required`, field);
		}
		return undefined;
	}

	// Ensure it's an array
	if (!Array.isArray(value)) {
		throw new ValidationError(`${field} must be an array`, field, value);
	}

	// Validate length
	if (options.minLength !== undefined && value.length < options.minLength) {
		throw new ValidationError(
			`${field} must contain at least ${options.minLength} items`,
			field,
			value,
		);
	}

	if (options.maxLength !== undefined && value.length > options.maxLength) {
		throw new ValidationError(
			`${field} must contain at most ${options.maxLength} items`,
			field,
			value,
		);
	}

	// Validate items
	if (options.itemValidator) {
		return value.map((item, index) => {
			try {
				return options.itemValidator?.(item, index);
			} catch (error) {
				if (error instanceof ValidationError) {
					throw new ValidationError(
						`${field}[${index}]: ${error.message}`,
						`${field}[${index}]`,
						item,
					);
				}
				throw error;
			}
		}) as T[];
	}

	return value as T[];
}

/**
 * Validates and sanitizes an object input
 */
export function validateObject<T extends Record<string, unknown>>(
	value: unknown,
	field: string,
	options: {
		required?: boolean;
		schema?: {
			[K in keyof T]: (value: unknown) => T[K];
		};
	} = {},
): T | undefined {
	// Handle undefined/null
	if (value === undefined || value === null) {
		if (options.required) {
			throw new ValidationError(`${field} is required`, field);
		}
		return undefined;
	}

	// Ensure it's an object
	if (typeof value !== "object" || Array.isArray(value)) {
		throw new ValidationError(`${field} must be an object`, field, value);
	}

	// Validate schema
	if (options.schema) {
		const result = {} as T;
		const obj = value as Record<string, unknown>;

		for (const [key, validator] of Object.entries(options.schema)) {
			try {
				result[key as keyof T] = validator(obj[key]);
			} catch (error) {
				if (error instanceof ValidationError) {
					throw new ValidationError(
						`${field}.${key}: ${error.message}`,
						`${field}.${key}`,
						obj[key],
					);
				}
				throw error;
			}
		}

		return result;
	}

	return value as T;
}

/**
 * Common string sanitizers
 */
export const sanitizers = {
	trim: (value: string) => value.trim(),
	lowercase: (value: string) => value.toLowerCase(),
	uppercase: (value: string) => value.toUpperCase(),
	removeWhitespace: (value: string) => value.replace(/\s+/g, ""),
	alphanumeric: (value: string) => value.replace(/[^a-zA-Z0-9]/g, ""),
	alphanumericWithSpaces: (value: string) =>
		value.replace(/[^a-zA-Z0-9\s]/g, ""),
	email: (value: string) => value.trim().toLowerCase(),
	url: (value: string) => {
		try {
			const parsed = new URL(value);
			return parsed.toString();
		} catch {
			throw new ValidationError("Invalid URL format", "url", value);
		}
	},
};

/**
 * Common validation patterns
 */
export const patterns = {
	email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
	alphanumeric: /^[a-zA-Z0-9]+$/,
	alphanumericWithSpaces: /^[a-zA-Z0-9\s]+$/,
	// Account name: alphanumeric with spaces, hyphens, and underscores
	accountName: /^[a-zA-Z0-9\s\-_]+$/,
	// Path pattern for API endpoints
	apiPath: /^\/v1\/[a-zA-Z0-9\-_/]*$/,
};
