import { formatTokensPerSecond } from "@ccflare/ui-common";
import { Activity, Zap } from "lucide-react";
import type { TimeRange } from "../../constants";
import { ModelTokenSpeedChart } from "../charts/ModelTokenSpeedChart";
import { TokenSpeedChart } from "../charts/TokenSpeedChart";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface TokenSpeedAnalyticsProps {
	timeSeriesData: Array<{
		time: string;
		avgTokensPerSecond: number;
		[key: string]: string | number;
	}>;
	modelPerformance: Array<{
		model: string;
		avgTokensPerSecond: number | null;
		minTokensPerSecond: number | null;
		maxTokensPerSecond: number | null;
	}>;
	loading?: boolean;
	timeRange: TimeRange;
}

export function TokenSpeedAnalytics({
	timeSeriesData,
	modelPerformance,
	loading = false,
	timeRange,
}: TokenSpeedAnalyticsProps) {
	// Calculate overall statistics
	const validSpeeds = timeSeriesData
		.map((d) => d.avgTokensPerSecond)
		.filter((speed) => speed > 0);

	const overallAvgSpeed =
		validSpeeds.length > 0
			? validSpeeds.reduce((sum, speed) => sum + speed, 0) / validSpeeds.length
			: 0;

	// Get the true maximum speed from model performance data
	const maxSpeed = Math.max(
		...modelPerformance
			.map((m) => m.maxTokensPerSecond || 0)
			.filter((speed) => speed > 0),
		0,
	);

	// Find fastest model by peak speed
	const fastestModel = modelPerformance
		.filter((m) => m.maxTokensPerSecond !== null && m.maxTokensPerSecond > 0)
		.sort(
			(a, b) => (b.maxTokensPerSecond || 0) - (a.maxTokensPerSecond || 0),
		)[0];

	return (
		<div className="space-y-6">
			{/* Statistics Cards */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							Average Output Speed
						</CardTitle>
						<Activity className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatTokensPerSecond(overallAvgSpeed)}
						</div>
						<p className="text-xs text-muted-foreground">
							Across all models and requests
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Peak Speed</CardTitle>
						<Zap className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatTokensPerSecond(maxSpeed)}
						</div>
						<p className="text-xs text-muted-foreground">
							Maximum observed in {timeRange}
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Fastest Model</CardTitle>
						<Zap className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{fastestModel?.model || "N/A"}
						</div>
						<p className="text-xs text-muted-foreground">
							{fastestModel
								? `Peak: ${formatTokensPerSecond(fastestModel.maxTokensPerSecond || 0)}`
								: "No data"}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Charts */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Activity className="h-5 w-5" />
							Output Speed Over Time
						</CardTitle>
					</CardHeader>
					<CardContent>
						<TokenSpeedChart
							data={timeSeriesData}
							loading={loading}
							height={300}
							timeRange={timeRange}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Zap className="h-5 w-5" />
							Speed by Model
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ModelTokenSpeedChart
							data={modelPerformance}
							loading={loading}
							height={300}
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
