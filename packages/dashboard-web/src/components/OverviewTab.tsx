import type { AnalyticsResponse } from "@ccflare/http-api";
import { format } from "date-fns";
import {
	Activity,
	AlertCircle,
	CheckCircle,
	Clock,
	DollarSign,
	TrendingDown,
	TrendingUp,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { type Account, api, type Stats } from "../api";
import { StrategyCard } from "./StrategyCard";
import { Badge } from "./ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import { Skeleton } from "./ui/skeleton";

// ccflare-inspired color palette
const COLORS = {
	primary: "#f38020",
	success: "#10b981",
	warning: "#f59e0b",
	error: "#ef4444",
	blue: "#3b82f6",
	purple: "#8b5cf6",
	pink: "#ec4899",
};

const CHART_COLORS = [
	COLORS.primary,
	COLORS.blue,
	COLORS.purple,
	COLORS.pink,
	COLORS.success,
];

interface MetricCardProps {
	title: string;
	value: string | number;
	change?: number;
	icon: React.ComponentType<{ className?: string }>;
	trend?: "up" | "down" | "flat";
}

function MetricCard({
	title,
	value,
	change,
	icon: Icon,
	trend,
}: MetricCardProps) {
	return (
		<Card className="card-hover">
			<CardContent className="p-6">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<p className="text-sm font-medium text-muted-foreground">{title}</p>
						<p className="text-2xl font-bold">{value}</p>
						{change !== undefined && trend && trend !== "flat" && (
							<div className="flex items-center gap-1 text-sm">
								{trend === "up" ? (
									<TrendingUp className="h-4 w-4 text-success" />
								) : (
									<TrendingDown className="h-4 w-4 text-destructive" />
								)}
								<span
									className={
										trend === "up" ? "text-success" : "text-destructive"
									}
								>
									{Math.abs(change).toFixed(1)}%
								</span>
								<span className="text-muted-foreground">vs last hour</span>
							</div>
						)}
						{(change === undefined || trend === "flat") && (
							<div className="flex items-center gap-1 text-sm">
								<span className="text-muted-foreground">— vs last hour</span>
							</div>
						)}
					</div>
					<div className="rounded-full bg-primary/10 p-3">
						<Icon className="h-6 w-6 text-primary" />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function OverviewTab() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
	const [accounts, setAccounts] = useState<Account[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [timeSeriesData, setTimeSeriesData] = useState<
		Array<{
			time: string;
			requests: number;
			successRate: number;
			responseTime: number;
			cost: string;
		}>
	>([]);

	useEffect(() => {
		const loadData = async () => {
			try {
				// Fetch stats, analytics, and accounts data
				const [statsData, analyticsData, accountsData] = await Promise.all([
					api.getStats(),
					api.getAnalytics("24h"),
					api.getAccounts(),
				]);
				setStats(statsData);
				setAnalytics(analyticsData);
				setAccounts(accountsData);

				// Transform analytics time series data
				const transformedTimeSeries = analyticsData.timeSeries.map((point) => ({
					time: format(new Date(point.ts), "HH:mm"),
					requests: point.requests,
					successRate: point.successRate,
					responseTime: Math.round(point.avgResponseTime),
					cost: point.costUsd.toFixed(2),
				}));
				setTimeSeriesData(transformedTimeSeries);

				setLoading(false);
			} catch (error) {
				console.error("Failed to load data:", error);
				setLoading(false);
			}
		};

		loadData();
		const interval = setInterval(loadData, 30000); // Update every 30 seconds
		return () => clearInterval(interval);
	}, []);

	if (loading) {
		return (
			<div className="space-y-6">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					{[...Array(4)].map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Skeleton cards are temporary placeholders
						<Card key={i}>
							<CardContent className="p-6">
								<Skeleton className="h-4 w-24 mb-2" />
								<Skeleton className="h-8 w-32 mb-2" />
								<Skeleton className="h-4 w-20" />
							</CardContent>
						</Card>
					))}
				</div>
				<Card>
					<CardHeader>
						<Skeleton className="h-6 w-32" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-64 w-full" />
					</CardContent>
				</Card>
			</div>
		);
	}

	// Helper function to calculate percentage change
	function pctChange(current: number, previous: number): number | null {
		if (previous === 0) return null; // avoid division by zero
		return ((current - previous) / previous) * 100;
	}

	// Calculate percentage changes from time series data
	let deltaRequests: number | null = null;
	let deltaSuccessRate: number | null = null;
	let deltaResponseTime: number | null = null;
	let deltaCost: number | null = null;
	let trendRequests: "up" | "down" | "flat" = "flat";
	let trendSuccessRate: "up" | "down" | "flat" = "flat";
	let trendResponseTime: "up" | "down" | "flat" = "flat";
	let trendCost: "up" | "down" | "flat" = "flat";

	if (timeSeriesData.length >= 2) {
		const lastBucket = timeSeriesData[timeSeriesData.length - 1];
		const prevBucket = timeSeriesData[timeSeriesData.length - 2];

		// Calculate deltas
		deltaRequests = pctChange(lastBucket.requests, prevBucket.requests);
		deltaSuccessRate = pctChange(
			lastBucket.successRate,
			prevBucket.successRate,
		);
		// For response time, lower is better, so we invert the calculation
		deltaResponseTime = pctChange(
			prevBucket.responseTime,
			lastBucket.responseTime,
		);
		deltaCost = pctChange(
			Number.parseFloat(lastBucket.cost),
			Number.parseFloat(prevBucket.cost),
		);

		// Determine trends
		trendRequests =
			deltaRequests !== null ? (deltaRequests >= 0 ? "up" : "down") : "flat";
		trendSuccessRate =
			deltaSuccessRate !== null
				? deltaSuccessRate >= 0
					? "up"
					: "down"
				: "flat";
		// For response time, lower is better (negative change is good)
		trendResponseTime =
			deltaResponseTime !== null
				? deltaResponseTime >= 0
					? "up"
					: "down"
				: "flat";
		// For cost, higher is bad (positive change is bad)
		trendCost = deltaCost !== null ? (deltaCost >= 0 ? "down" : "up") : "flat";
	}

	// Use analytics data for model distribution
	const modelData =
		analytics?.modelDistribution?.map((model) => ({
			name: model.model || "Unknown",
			value: model.count,
		})) || [];

	// Use analytics data for account health
	const accountHealthData = analytics?.accountPerformance || [];

	return (
		<div className="space-y-6">
			{/* Metrics Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<MetricCard
					title="Total Requests"
					value={analytics?.totals.requests?.toLocaleString() || "0"}
					change={deltaRequests !== null ? deltaRequests : undefined}
					trend={trendRequests}
					icon={Activity}
				/>
				<MetricCard
					title="Success Rate"
					value={`${Math.round(analytics?.totals.successRate || 0)}%`}
					change={deltaSuccessRate !== null ? deltaSuccessRate : undefined}
					trend={trendSuccessRate}
					icon={CheckCircle}
				/>
				<MetricCard
					title="Avg Response Time"
					value={`${Math.round(analytics?.totals.avgResponseTime || 0)}ms`}
					change={deltaResponseTime !== null ? deltaResponseTime : undefined}
					trend={trendResponseTime}
					icon={Clock}
				/>
				<MetricCard
					title="Total Cost"
					value={`$${analytics?.totals.totalCostUsd?.toFixed(2) || "0.00"}`}
					change={deltaCost !== null ? deltaCost : undefined}
					trend={trendCost}
					icon={DollarSign}
				/>
			</div>

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
						<ResponsiveContainer width="100%" height={300}>
							<AreaChart data={timeSeriesData}>
								<defs>
									<linearGradient
										id="colorRequests"
										x1="0"
										y1="0"
										x2="0"
										y2="1"
									>
										<stop
											offset="5%"
											stopColor={COLORS.primary}
											stopOpacity={0.8}
										/>
										<stop
											offset="95%"
											stopColor={COLORS.primary}
											stopOpacity={0.1}
										/>
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis dataKey="time" className="text-xs" />
								<YAxis className="text-xs" />
								<Tooltip
									contentStyle={{
										backgroundColor: "var(--background)",
										border: "1px solid var(--border)",
										borderRadius: "var(--radius)",
									}}
								/>
								<Area
									type="monotone"
									dataKey="requests"
									stroke={COLORS.primary}
									fillOpacity={1}
									fill="url(#colorRequests)"
								/>
							</AreaChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>

				{/* Success Rate Chart */}
				<Card>
					<CardHeader>
						<CardTitle>Success Rate Trend</CardTitle>
						<CardDescription>Success percentage over time</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer width="100%" height={300}>
							<LineChart data={timeSeriesData}>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis dataKey="time" className="text-xs" />
								<YAxis domain={[80, 100]} className="text-xs" />
								<Tooltip
									contentStyle={{
										backgroundColor: "var(--background)",
										border: "1px solid var(--border)",
										borderRadius: "var(--radius)",
									}}
								/>
								<Line
									type="monotone"
									dataKey="successRate"
									stroke={COLORS.success}
									strokeWidth={2}
									dot={false}
								/>
							</LineChart>
						</ResponsiveContainer>
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
						<ResponsiveContainer width="100%" height={250}>
							<PieChart>
								<Pie
									data={modelData}
									cx="50%"
									cy="50%"
									innerRadius={60}
									outerRadius={80}
									paddingAngle={5}
									dataKey="value"
								>
									{modelData.map((entry, index) => (
										<Cell
											key={`cell-${entry.name}`}
											fill={CHART_COLORS[index % CHART_COLORS.length]}
										/>
									))}
								</Pie>
								<Tooltip
									contentStyle={{
										backgroundColor: COLORS.success,
										border: `1px solid ${COLORS.success}`,
										borderRadius: "var(--radius)",
										color: "#fff",
									}}
								/>
							</PieChart>
						</ResponsiveContainer>
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
						<ResponsiveContainer width="100%" height={250}>
							<BarChart data={accountHealthData}>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis dataKey="name" className="text-xs" />
								<YAxis yAxisId="left" className="text-xs" />
								<YAxis
									yAxisId="right"
									orientation="right"
									className="text-xs"
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: "var(--background)",
										border: "1px solid var(--border)",
										borderRadius: "var(--radius)",
									}}
								/>
								<Legend />
								<Bar
									yAxisId="left"
									dataKey="requests"
									fill={COLORS.primary}
									name="Requests"
								/>
								<Bar
									yAxisId="right"
									dataKey="successRate"
									fill={COLORS.success}
									name="Success %"
								/>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			</div>

			{/* Recent Activity */}
			<Card>
				<CardHeader>
					<CardTitle>System Status</CardTitle>
					<CardDescription>
						Current operational status and recent events
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div className="flex items-center justify-between p-4 rounded-lg bg-success/10">
							<div className="flex items-center gap-3">
								<CheckCircle className="h-5 w-5 text-success" />
								<div>
									<p className="font-medium">All Systems Operational</p>
									<p className="text-sm text-muted-foreground">
										No issues detected
									</p>
								</div>
							</div>
							<Badge variant="default" className="bg-success">
								Healthy
							</Badge>
						</div>

						{stats?.recentErrors && stats.recentErrors.length > 0 && (
							<div className="space-y-2">
								<h4 className="text-sm font-medium text-muted-foreground">
									Recent Errors
								</h4>
								{stats.recentErrors.slice(0, 3).map((error, i) => (
									<div
										key={`error-${error.substring(0, 20)}-${i}`}
										className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10"
									>
										<XCircle className="h-4 w-4 text-destructive mt-0.5" />
										<p className="text-sm text-muted-foreground">{error}</p>
									</div>
								))}
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Rate Limit Status */}
			{accounts?.some(
				(acc) =>
					acc.rateLimitStatus !== "OK" && acc.rateLimitStatus !== "Paused",
			) && (
				<Card>
					<CardHeader>
						<CardTitle>Rate Limit Info</CardTitle>
						<CardDescription>
							Rate limit information about accounts
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{accounts
								.filter(
									(acc) =>
										acc.rateLimitStatus !== "OK" &&
										acc.rateLimitStatus !== "Paused",
								)
								.map((account) => {
									const resetTime = account.rateLimitReset
										? new Date(account.rateLimitReset)
										: null;
									const now = new Date();
									const timeUntilReset = resetTime
										? Math.max(0, resetTime.getTime() - now.getTime())
										: null;
									const minutesLeft = timeUntilReset
										? Math.ceil(timeUntilReset / 60000)
										: null;

									return (
										<div
											key={account.id}
											className="flex items-center justify-between p-4 rounded-lg bg-warning/10"
										>
											<div className="flex items-center gap-3">
												<AlertCircle className="h-5 w-5 text-warning" />
												<div>
													<p className="font-medium">{account.name}</p>
													<p className="text-sm text-muted-foreground">
														{account.rateLimitStatus}
														{account.rateLimitRemaining !== null &&
															` • ${account.rateLimitRemaining} requests remaining`}
													</p>
												</div>
											</div>
											<div className="text-right">
												{resetTime && (
													<>
														<p className="text-sm font-medium">
															Resets in {minutesLeft}m
														</p>
														<p className="text-xs text-muted-foreground">
															{format(resetTime, "HH:mm:ss")}
														</p>
													</>
												)}
											</div>
										</div>
									);
								})}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Configuration Row */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<StrategyCard />
			</div>
		</div>
	);
}
