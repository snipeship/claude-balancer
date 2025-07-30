import { CHART_COLORS, COLORS } from "../../constants";
import {
	BaseAreaChart,
	BaseBarChart,
	BaseLineChart,
	BasePieChart,
} from "../charts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";

interface ChartsSectionProps {
	timeSeriesData: Array<{
		time: string;
		requests: number;
		successRate: number;
		responseTime: number;
		cost: string;
	}>;
	modelData: Array<{ name: string; value: number }>;
	accountHealthData: Array<{
		name: string;
		requests: number;
		successRate: number;
	}>;
	loading: boolean;
}

export function ChartsSection({
	timeSeriesData,
	modelData,
	accountHealthData,
	loading,
}: ChartsSectionProps) {
	return (
		<>
			{/* Charts Row 1 */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Request Volume Chart */}
				<Card>
					<CardHeader>
						<CardTitle>Request Volume</CardTitle>
						<CardDescription>
							Requests per hour over the last 24 hours
						</CardDescription>
					</CardHeader>
					<CardContent>
						<BaseAreaChart
							data={timeSeriesData}
							dataKey="requests"
							loading={loading}
							height="medium"
						/>
					</CardContent>
				</Card>

				{/* Success Rate Chart */}
				<Card>
					<CardHeader>
						<CardTitle>Success Rate Trend</CardTitle>
						<CardDescription>Success percentage over time</CardDescription>
					</CardHeader>
					<CardContent>
						<BaseLineChart
							data={timeSeriesData}
							lines={{ dataKey: "successRate", stroke: COLORS.success }}
							loading={loading}
							height="medium"
							yAxisDomain={[80, 100]}
						/>
					</CardContent>
				</Card>
			</div>

			{/* Charts Row 2 */}
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Model Distribution */}
				<Card>
					<CardHeader>
						<CardTitle>Model Usage</CardTitle>
						<CardDescription>
							Distribution of API calls by model
						</CardDescription>
					</CardHeader>
					<CardContent>
						<BasePieChart
							data={modelData}
							loading={loading}
							height="small"
							innerRadius={60}
							outerRadius={80}
							paddingAngle={5}
							tooltipStyle="success"
						/>
						<div className="mt-4 space-y-2">
							{modelData.map((model, index) => (
								<div
									key={model.name}
									className="flex items-center justify-between text-sm"
								>
									<div className="flex items-center gap-2">
										<div
											className="h-3 w-3 rounded-full"
											style={{
												backgroundColor:
													CHART_COLORS[index % CHART_COLORS.length],
											}}
										/>
										<span className="text-muted-foreground">{model.name}</span>
									</div>
									<span className="font-medium">{model.value}</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Account Health */}
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>Account Performance</CardTitle>
						<CardDescription>
							Request distribution and success rates by account
						</CardDescription>
					</CardHeader>
					<CardContent>
						<BaseBarChart
							data={accountHealthData}
							bars={[
								{ dataKey: "requests", yAxisId: "left", name: "Requests" },
								{
									dataKey: "successRate",
									yAxisId: "right",
									fill: COLORS.success,
									name: "Success %",
								},
							]}
							xAxisKey="name"
							loading={loading}
							height="small"
							secondaryYAxis={true}
							showLegend={true}
						/>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
