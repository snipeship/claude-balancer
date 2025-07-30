import { Activity, BarChart3, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";
import type { TimeRange } from "../../constants";
import { ModelPerformanceComparison, ModelTokenSpeedChart } from "../charts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

interface ModelAnalyticsProps {
	modelPerformance: Array<{
		model: string;
		avgResponseTime: number;
		p95ResponseTime: number;
		errorRate: number;
		avgTokensPerSecond: number | null;
		minTokensPerSecond: number | null;
		maxTokensPerSecond: number | null;
	}>;
	costByModel: Array<{
		model: string;
		costUsd: number;
		requests: number;
		totalTokens?: number;
	}>;
	loading?: boolean;
	timeRange: TimeRange;
}

export function ModelAnalytics({
	modelPerformance,
	costByModel,
	loading = false,
}: ModelAnalyticsProps) {
	const [comparisonView, setComparisonView] = useState<
		"speed-cost" | "performance" | "efficiency"
	>("speed-cost");

	// Prepare data for the comparison chart
	const comparisonData = modelPerformance.map((perf) => {
		const costData = costByModel.find((c) => c.model === perf.model);
		const totalCost = costData?.costUsd || 0;
		const totalRequests = costData?.requests || 1;
		const totalTokens = costData?.totalTokens || 0;

		// Calculate cost per 1k tokens
		let costPer1kTokens: number;
		if (totalTokens > 0) {
			// Use actual token count for accurate calculation
			costPer1kTokens = (totalCost / totalTokens) * 1000;
		} else {
			// Fallback: estimate based on average cost per request
			const avgCostPerRequest = totalCost / totalRequests;
			const _estimatedTokensPerRequest = 1000; // Rough estimate
			costPer1kTokens = avgCostPerRequest;
		}

		return {
			model: perf.model,
			avgTokensPerSecond: perf.avgTokensPerSecond,
			costPer1kTokens,
			avgResponseTime: perf.avgResponseTime,
			errorRate: perf.errorRate,
			totalRequests,
		};
	});

	return (
		<div className="space-y-6">
			{/* Header with title and controls */}
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-semibold">Model Performance Analytics</h3>
					<p className="text-sm text-muted-foreground">
						Comprehensive analysis of model performance, cost, and efficiency
					</p>
				</div>
			</div>

			{/* Tabbed interface for different views */}
			<Tabs defaultValue="comparison" className="space-y-4">
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="comparison" className="flex items-center gap-2">
						<TrendingUp className="h-4 w-4" />
						Multi-Metric Comparison
					</TabsTrigger>
					<TabsTrigger value="detailed" className="flex items-center gap-2">
						<BarChart3 className="h-4 w-4" />
						Detailed Analysis
					</TabsTrigger>
				</TabsList>

				{/* Multi-Metric Comparison Tab */}
				<TabsContent value="comparison" className="space-y-4">
					<Card className="bg-gradient-to-br from-background to-muted/10 border-muted">
						<CardHeader>
							<div className="flex items-center justify-between">
								<div className="space-y-1">
									<CardTitle className="text-2xl font-bold flex items-center gap-2">
										<Zap className="h-6 w-6 text-purple-500" />
										Model Performance Comparison
									</CardTitle>
									<CardDescription>
										{comparisonView === "speed-cost"
											? "Token generation speed vs. cost efficiency"
											: comparisonView === "performance"
												? "Response time and error rate analysis"
												: "Overall efficiency score (speed/cost ratio)"}
									</CardDescription>
								</div>
								<Select
									value={comparisonView}
									onValueChange={(v) =>
										setComparisonView(
											v as "speed-cost" | "performance" | "efficiency",
										)
									}
								>
									<SelectTrigger className="w-48">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="speed-cost">
											<div className="flex items-center gap-2">
												<Zap className="h-4 w-4" />
												Speed vs Cost
											</div>
										</SelectItem>
										<SelectItem value="performance">
											<div className="flex items-center gap-2">
												<Activity className="h-4 w-4" />
												Performance Metrics
											</div>
										</SelectItem>
										<SelectItem value="efficiency">
											<div className="flex items-center gap-2">
												<TrendingUp className="h-4 w-4" />
												Efficiency Score
											</div>
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</CardHeader>
						<CardContent>
							<ModelPerformanceComparison
								data={comparisonData}
								loading={loading}
								height={400}
								viewMode={comparisonView}
							/>
						</CardContent>
					</Card>
				</TabsContent>

				{/* Detailed Analysis Tab */}
				<TabsContent value="detailed" className="space-y-4">
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						{/* Token Speed Chart */}
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Zap className="h-5 w-5" />
									Token Generation Speed
								</CardTitle>
								<CardDescription>
									Average, min, and max tokens per second by model
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ModelTokenSpeedChart
									data={modelPerformance}
									loading={loading}
									height={350}
								/>
							</CardContent>
						</Card>

						{/* Model Stats Cards */}
						<div className="space-y-4">
							{/* Fastest Model Card */}
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-medium">
										Fastest Model
									</CardTitle>
								</CardHeader>
								<CardContent>
									{(() => {
										const fastest = modelPerformance
											.filter((m) => m.avgTokensPerSecond !== null)
											.sort(
												(a, b) =>
													(b.avgTokensPerSecond || 0) -
													(a.avgTokensPerSecond || 0),
											)[0];
										return fastest ? (
											<div className="space-y-2">
												<p className="text-2xl font-bold">{fastest.model}</p>
												<div className="flex items-center gap-4 text-sm">
													<span className="text-muted-foreground">Speed:</span>
													<span className="font-medium">
														{fastest.avgTokensPerSecond?.toFixed(1)} tok/s
													</span>
												</div>
												<div className="flex items-center gap-4 text-sm">
													<span className="text-muted-foreground">
														Response:
													</span>
													<span className="font-medium">
														{fastest.avgResponseTime.toFixed(0)}ms
													</span>
												</div>
											</div>
										) : (
											<p className="text-muted-foreground">No data</p>
										);
									})()}
								</CardContent>
							</Card>

							{/* Most Reliable Model Card */}
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-medium">
										Most Reliable Model
									</CardTitle>
								</CardHeader>
								<CardContent>
									{(() => {
										const reliable = modelPerformance.sort(
											(a, b) => a.errorRate - b.errorRate,
										)[0];
										return reliable ? (
											<div className="space-y-2">
												<p className="text-2xl font-bold">{reliable.model}</p>
												<div className="flex items-center gap-4 text-sm">
													<span className="text-muted-foreground">
														Error Rate:
													</span>
													<span className="font-medium text-green-600">
														{reliable.errorRate.toFixed(2)}%
													</span>
												</div>
												<div className="flex items-center gap-4 text-sm">
													<span className="text-muted-foreground">
														p95 Response:
													</span>
													<span className="font-medium">
														{reliable.p95ResponseTime.toFixed(0)}ms
													</span>
												</div>
											</div>
										) : (
											<p className="text-muted-foreground">No data</p>
										);
									})()}
								</CardContent>
							</Card>

							{/* Most Cost-Effective Model Card */}
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-medium">
										Most Cost-Effective
									</CardTitle>
								</CardHeader>
								<CardContent>
									{(() => {
										const costEffective = comparisonData
											.filter(
												(m) =>
													m.avgTokensPerSecond !== null &&
													m.costPer1kTokens > 0,
											)
											.sort((a, b) => {
												const efficiencyA =
													(a.avgTokensPerSecond || 0) / a.costPer1kTokens;
												const efficiencyB =
													(b.avgTokensPerSecond || 0) / b.costPer1kTokens;
												return efficiencyB - efficiencyA;
											})[0];
										return costEffective ? (
											<div className="space-y-2">
												<p className="text-2xl font-bold">
													{costEffective.model}
												</p>
												<div className="flex items-center gap-4 text-sm">
													<span className="text-muted-foreground">
														Efficiency:
													</span>
													<span className="font-medium">
														{(
															(costEffective.avgTokensPerSecond || 0) /
															costEffective.costPer1kTokens
														).toFixed(2)}{" "}
														tok/s/$
													</span>
												</div>
												<div className="flex items-center gap-4 text-sm">
													<span className="text-muted-foreground">
														Cost/1K:
													</span>
													<span className="font-medium">
														${costEffective.costPer1kTokens.toFixed(3)}
													</span>
												</div>
											</div>
										) : (
											<p className="text-muted-foreground">No data</p>
										);
									})()}
								</CardContent>
							</Card>
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
