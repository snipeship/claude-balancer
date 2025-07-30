import { formatPercentage } from "@ccflare/ui-common";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

export interface MetricCardProps {
	title: string;
	value: string | number;
	change?: number;
	icon: React.ComponentType<{ className?: string }>;
	trend?: "up" | "down" | "flat";
	trendPeriod?: string;
}

export function MetricCard({
	title,
	value,
	change,
	icon: Icon,
	trend,
	trendPeriod,
}: MetricCardProps) {
	const trendElement = trend !== "flat" && change !== undefined && (
		<div
			className={`flex items-center gap-1 text-sm font-medium ${
				trend === "up" ? "text-success" : "text-destructive"
			}`}
		>
			{trend === "up" ? (
				<TrendingUp className="h-4 w-4" />
			) : (
				<TrendingDown className="h-4 w-4" />
			)}
			<span>{formatPercentage(Math.abs(change), 0)}</span>
		</div>
	);

	return (
		<Card>
			<CardContent className="p-6">
				<div className="flex items-center justify-between mb-4">
					<Icon className="h-8 w-8 text-muted-foreground/20" />
					{trendPeriod && trendElement ? (
						<Popover>
							<PopoverTrigger asChild>
								<div className="flex items-center gap-1 cursor-help">
									{trendElement}
									<Info className="h-3 w-3 text-muted-foreground" />
								</div>
							</PopoverTrigger>
							<PopoverContent className="w-auto p-2 text-xs">
								<p>Compared to {trendPeriod}</p>
							</PopoverContent>
						</Popover>
					) : (
						trendElement
					)}
				</div>
				<div className="space-y-1">
					<p className="text-sm text-muted-foreground">{title}</p>
					<p className="text-2xl font-bold">{value}</p>
				</div>
			</CardContent>
		</Card>
	);
}
