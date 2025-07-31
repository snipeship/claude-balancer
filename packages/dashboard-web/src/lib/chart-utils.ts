/**
 * Format numbers in compact notation for chart axes
 * 1000 -> 1k
 * 1000000 -> 1M
 * 1000000000 -> 1B
 */
export function formatCompactNumber(value: number | string): string {
	const numValue = typeof value === "string" ? Number(value) : value;
	if (Number.isNaN(numValue)) return String(value);

	const absValue = Math.abs(numValue);
	const sign = numValue < 0 ? "-" : "";

	if (absValue >= 1e9) {
		return `${sign}${(absValue / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
	}
	if (absValue >= 1e6) {
		return `${sign}${(absValue / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
	}
	if (absValue >= 1e3) {
		return `${sign}${(absValue / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
	}
	return `${sign}${absValue.toString()}`;
}

/**
 * Format currency in compact notation
 * $1234 -> $1.2k
 */
export function formatCompactCurrency(value: number | string): string {
	return `$${formatCompactNumber(value)}`;
}
