// Common types for chart components
export type ChartDataPoint = Record<string, string | number>;

export type TooltipFormatterValue = string | number | [number, number];

export type TooltipFormatterFunction = (
	value: TooltipFormatterValue,
	name?: string,
) => [string, string] | string;

// Use any for chart click handlers to match recharts types
// biome-ignore lint/suspicious/noExplicitAny: recharts types require any
export type ChartClickHandler = (data: any) => void;
