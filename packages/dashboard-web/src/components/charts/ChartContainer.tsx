import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { CHART_HEIGHTS } from "../../constants";

interface ChartContainerProps {
	children: ReactNode;
	loading?: boolean;
	height?: keyof typeof CHART_HEIGHTS | number;
	className?: string;
	error?: Error | null;
	emptyState?: ReactNode;
	isEmpty?: boolean;
}

export function ChartContainer({
	children,
	loading = false,
	height = "medium",
	className = "",
	error = null,
	emptyState,
	isEmpty = false,
}: ChartContainerProps) {
	const chartHeight =
		typeof height === "number" ? height : CHART_HEIGHTS[height];

	if (error) {
		return (
			<div
				className={`flex items-center justify-center ${className}`}
				style={{ height: chartHeight }}
			>
				<div className="text-center space-y-2">
					<p className="text-sm text-destructive">Error loading chart data</p>
					<p className="text-xs text-muted-foreground">{error.message}</p>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div
				className={`flex items-center justify-center ${className}`}
				style={{ height: chartHeight }}
			>
				<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (isEmpty && emptyState) {
		return (
			<div
				className={`flex items-center justify-center ${className}`}
				style={{ height: chartHeight }}
			>
				{emptyState}
			</div>
		);
	}

	return <div className={className}>{children}</div>;
}
