import type { AnalyticsResponse } from "@ccflare/http-api";
import { format } from "date-fns";
import { CalendarDays, Filter, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { api } from "../api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";

const COLORS = {
	primary: "#f38020",
	success: "#10b981",
	warning: "#f59e0b",
	error: "#ef4444",
	blue: "#3b82f6",
	purple: "#8b5cf6",
};

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";

interface FilterState {
	accounts: string[];
	models: string[];
	status: "all" | "success" | "error";
}

export function AnalyticsTab() {
	const [timeRange, setTimeRange] = useState<TimeRange>("1h");
	const [selectedMetric, setSelectedMetric] = useState("requests");
	const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [filterOpen, setFilterOpen] = useState(false);
	const [viewMode, setViewMode] = useState<"normal" | "cumulative">("normal");
	const [filters, setFilters] = useState<FilterState>({
		accounts: [],
		models: [],
		status: "all",
	});

	// Fetch analytics data
	useEffect(() => {
		const loadData = async () => {
			try {
				setLoading(true);
				const data = await api.getAnalytics(timeRange, filters, viewMode);
				setAnalytics(data);
				setLoading(false);
			} catch (error) {
				console.error("Failed to load analytics:", error);
				setLoading(false);
			}
		};

		loadData();
	}, [timeRange, filters, viewMode]);

	// Get unique accounts and models from analytics data
	const availableAccounts =
		analytics?.accountPerformance?.map((a) => a.name) || [];
	const availableModels =
		analytics?.modelDistribution?.map((m) => m.model) || [];

	// Apply filters to data
	const filterData = <T extends { errorRate?: number | string }>(
		data: T[],
	): T[] => {
		if (!analytics) return data;

		return data.filter((point) => {
			// Status filter
			if (filters.status !== "all") {
				const errorRate =
					typeof point.errorRate === "string"
						? parseFloat(point.errorRate)
						: point.errorRate || 0;
				if (filters.status === "success" && errorRate > 50) return false;
				if (filters.status === "error" && errorRate <= 50) return false;
			}

			// For time series data, we can't filter by specific accounts/models
			// Those filters will be applied to the other charts
			return true;
		});
	};

	// Transform time series data for charts
	const data = filterData(
		analytics?.timeSeries.map((point) => ({
			time:
				timeRange === "30d"
					? format(new Date(point.ts), "MMM d")
					: format(new Date(point.ts), "HH:mm"),
			requests: point.requests,
			tokens: point.tokens,
			cost: point.costUsd.toFixed(2),
			responseTime: Math.round(point.avgResponseTime),
			errorRate: point.errorRate.toFixed(1),
			cacheHitRate: point.cacheHitRate.toFixed(1),
		})) || [],
	);

	// Calculate token usage breakdown
	const tokenBreakdown = analytics?.tokenBreakdown
		? [
				{
					type: "Input Tokens",
					value: analytics.tokenBreakdown.inputTokens,
					percentage: 0,
				},
				{
					type: "Cache Read",
					value: analytics.tokenBreakdown.cacheReadInputTokens,
					percentage: 0,
				},
				{
					type: "Cache Creation",
					value: analytics.tokenBreakdown.cacheCreationInputTokens,
					percentage: 0,
				},
				{
					type: "Output Tokens",
					value: analytics.tokenBreakdown.outputTokens,
					percentage: 0,
				},
			].map((item) => {
				const total = analytics.totals.totalTokens || 1;
				return { ...item, percentage: Math.round((item.value / total) * 100) };
			})
		: [];

	// Use real model performance data from backend with filters
	const modelPerformance =
		analytics?.modelPerformance
			?.filter(
				(perf) =>
					filters.models.length === 0 || filters.models.includes(perf.model),
			)
			?.map((perf) => ({
				model: perf.model,
				avgTime: Math.round(perf.avgResponseTime),
				p95Time: Math.round(perf.p95ResponseTime),
				errorRate: perf.errorRate.toFixed(1),
			})) || [];

	// Use real cost by model data with filters
	const costByModel =
		analytics?.costByModel
			?.filter(
				(model) =>
					filters.models.length === 0 || filters.models.includes(model.model),
			)
			?.slice(0, 4)
			.map((model) => ({
				model: model.model,
				cost: model.costUsd,
				requests: model.requests,
			})) || [];

	// Count active filters
	const activeFilterCount =
		filters.accounts.length +
		filters.models.length +
		(filters.status !== "all" ? 1 : 0);

	return (
		<div className="space-y-6">
			{/* Controls */}
			<div className="flex flex-col sm:flex-row gap-4 justify-between">
				<div className="flex flex-wrap gap-2">
					<Select
						value={timeRange}
						onValueChange={(v) => setTimeRange(v as TimeRange)}
					>
						<SelectTrigger className="w-32">
							<CalendarDays className="h-4 w-4 mr-2" />
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="1h">Last Hour</SelectItem>
							<SelectItem value="6h">Last 6 Hours</SelectItem>
							<SelectItem value="24h">Last 24 Hours</SelectItem>
							<SelectItem value="7d">Last 7 Days</SelectItem>
							<SelectItem value="30d">Last 30 Days</SelectItem>
						</SelectContent>
					</Select>

					<Popover open={filterOpen} onOpenChange={setFilterOpen}>
						<PopoverTrigger asChild>
							<Button variant="outline" size="sm">
								<Filter className="h-4 w-4 mr-2" />
								Filters
								{activeFilterCount > 0 && (
									<Badge variant="secondary" className="ml-2 h-5 px-1">
										{activeFilterCount}
									</Badge>
								)}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-80" align="start">
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<h4 className="font-medium leading-none">Filters</h4>
									{activeFilterCount > 0 && (
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												setFilters({ accounts: [], models: [], status: "all" })
											}
										>
											Clear all
										</Button>
									)}
								</div>

								<Separator />

								{/* Status Filter */}
								<div className="space-y-2">
									<Label>Status</Label>
									<Select
										value={filters.status}
										onValueChange={(value) =>
											setFilters({
												...filters,
												status: value as FilterState["status"],
											})
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Requests</SelectItem>
											<SelectItem value="success">Success Only</SelectItem>
											<SelectItem value="error">Errors Only</SelectItem>
										</SelectContent>
									</Select>
								</div>

								{/* Account Filter */}
								{availableAccounts.length > 0 && (
									<div className="space-y-2">
										<Label>Accounts ({filters.accounts.length} selected)</Label>
										<div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
											{availableAccounts.map((account) => (
												<label
													key={account}
													className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
												>
													<input
														type="checkbox"
														className="rounded border-gray-300"
														checked={filters.accounts.includes(account)}
														onChange={(e) => {
															if (e.target.checked) {
																setFilters({
																	...filters,
																	accounts: [...filters.accounts, account],
																});
															} else {
																setFilters({
																	...filters,
																	accounts: filters.accounts.filter(
																		(a) => a !== account,
																	),
																});
															}
														}}
													/>
													<span className="text-sm">{account}</span>
												</label>
											))}
										</div>
									</div>
								)}

								{/* Model Filter */}
								{availableModels.length > 0 && (
									<div className="space-y-2">
										<Label>Models ({filters.models.length} selected)</Label>
										<div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
											{availableModels.map((model) => (
												<label
													key={model}
													className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-1 rounded"
												>
													<input
														type="checkbox"
														className="rounded border-gray-300"
														checked={filters.models.includes(model)}
														onChange={(e) => {
															if (e.target.checked) {
																setFilters({
																	...filters,
																	models: [...filters.models, model],
																});
															} else {
																setFilters({
																	...filters,
																	models: filters.models.filter(
																		(m) => m !== model,
																	),
																});
															}
														}}
													/>
													<span className="text-sm truncate">{model}</span>
												</label>
											))}
										</div>
									</div>
								)}

								<Separator />

								<div className="flex justify-end">
									<Button size="sm" onClick={() => setFilterOpen(false)}>
										Done
									</Button>
								</div>
							</div>
						</PopoverContent>
					</Popover>
				</div>

				<div className="flex gap-2">
					<div className="flex gap-1 bg-muted rounded-md p-1">
						<Button
							variant={viewMode === "normal" ? "default" : "ghost"}
							size="sm"
							className="h-8 px-3"
							onClick={() => setViewMode("normal")}
						>
							Normal
						</Button>
						<Button
							variant={viewMode === "cumulative" ? "default" : "ghost"}
							size="sm"
							className="h-8 px-3"
							onClick={() => setViewMode("cumulative")}
						>
							Cumulative
						</Button>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setTimeRange(timeRange); // Trigger re-fetch
						}}
						disabled={loading}
					>
						<RefreshCw
							className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
				</div>
			</div>

			{/* Main Metrics Chart */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Traffic Analytics</CardTitle>
							<CardDescription>
								{viewMode === "cumulative"
									? "Cumulative totals showing growth over time"
									: "Request volume and performance metrics over time"}
							</CardDescription>
						</div>
						<Select value={selectedMetric} onValueChange={setSelectedMetric}>
							<SelectTrigger className="w-40">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="requests">Requests</SelectItem>
								<SelectItem value="tokens">Token Usage</SelectItem>
								<SelectItem value="cost">Cost ($)</SelectItem>
								<SelectItem value="responseTime">Response Time</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="h-[400px] flex items-center justify-center">
							<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
						</div>
					) : (
						<ResponsiveContainer width="100%" height={400}>
							<AreaChart data={data}>
								<defs>
									<linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
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
									<linearGradient
										id="colorCumulative"
										x1="0"
										y1="0"
										x2="0"
										y2="1"
									>
										<stop
											offset="0%"
											stopColor={COLORS.purple}
											stopOpacity={0.9}
										/>
										<stop
											offset="50%"
											stopColor={COLORS.primary}
											stopOpacity={0.7}
										/>
										<stop
											offset="100%"
											stopColor={COLORS.blue}
											stopOpacity={0.3}
										/>
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis
									dataKey="time"
									className="text-xs"
									angle={timeRange === "7d" || timeRange === "30d" ? -45 : 0}
									textAnchor={
										timeRange === "7d" || timeRange === "30d" ? "end" : "middle"
									}
									height={timeRange === "7d" || timeRange === "30d" ? 60 : 30}
								/>
								<YAxis className="text-xs" />
								<Tooltip
									labelFormatter={(label) =>
										viewMode === "cumulative" ? `Cumulative at ${label}` : label
									}
									contentStyle={{
										backgroundColor: "var(--background)",
										border: "1px solid var(--border)",
										borderRadius: "var(--radius)",
									}}
								/>
								<Area
									type="monotone"
									dataKey={selectedMetric}
									stroke={
										viewMode === "cumulative" ? COLORS.purple : COLORS.primary
									}
									strokeWidth={viewMode === "cumulative" ? 3 : 2}
									fillOpacity={1}
									fill={
										viewMode === "cumulative"
											? "url(#colorCumulative)"
											: "url(#colorMetric)"
									}
									animationDuration={1000}
								/>
							</AreaChart>
						</ResponsiveContainer>
					)}
				</CardContent>
			</Card>

			{/* Secondary Charts Row */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Error Rate & Cache Hit Rate */}
				<Card>
					<CardHeader>
						<CardTitle>Performance Indicators</CardTitle>
						<CardDescription>
							Error rate and cache hit rate trends
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer width="100%" height={300}>
							<LineChart data={data}>
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
								<Legend />
								<Line
									type="monotone"
									dataKey="errorRate"
									stroke={COLORS.error}
									strokeWidth={2}
									dot={false}
									name="Error Rate %"
								/>
								<Line
									type="monotone"
									dataKey="cacheHitRate"
									stroke={COLORS.success}
									strokeWidth={2}
									dot={false}
									name="Cache Hit %"
								/>
								<ReferenceLine
									y={90}
									stroke={COLORS.success}
									strokeDasharray="3 3"
								/>
								<ReferenceLine
									y={5}
									stroke={COLORS.error}
									strokeDasharray="3 3"
								/>
							</LineChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>

				{/* Token Usage Breakdown */}
				<Card>
					<CardHeader>
						<CardTitle>Token Usage Breakdown</CardTitle>
						<CardDescription>
							Distribution of token types in the last {timeRange}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{tokenBreakdown.map((item, index) => (
								<div key={item.type}>
									<div className="flex items-center justify-between mb-2">
										<span className="text-sm font-medium">{item.type}</span>
										<div className="flex items-center gap-2">
											<span className="text-sm text-muted-foreground">
												{item.value.toLocaleString()} tokens
											</span>
											<Badge variant="outline">{item.percentage}%</Badge>
										</div>
									</div>
									<div className="w-full bg-muted rounded-full h-2">
										<div
											className="h-2 rounded-full transition-all"
											style={{
												width: `${item.percentage}%`,
												backgroundColor:
													index === 0
														? COLORS.blue
														: index === 1
															? COLORS.success
															: index === 2
																? COLORS.warning
																: COLORS.purple,
											}}
										/>
									</div>
								</div>
							))}
							<div className="pt-4 border-t">
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">Total Tokens</span>
									<span className="text-lg font-bold">
										{tokenBreakdown
											.reduce((acc, item) => acc + item.value, 0)
											.toLocaleString()}
									</span>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Model Performance & Cost Analysis */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Model Performance */}
				<Card>
					<CardHeader>
						<CardTitle>Model Performance Comparison</CardTitle>
						<CardDescription>
							Response times and error rates by model
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer width="100%" height={300}>
							<ScatterChart>
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis
									dataKey="avgTime"
									name="Avg Response Time (ms)"
									className="text-xs"
									label={{
										value: "Avg Response Time (ms)",
										position: "insideBottom",
										offset: -5,
									}}
								/>
								<YAxis
									dataKey="errorRate"
									name="Error Rate %"
									className="text-xs"
									label={{
										value: "Error Rate %",
										angle: -90,
										position: "insideLeft",
									}}
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: COLORS.success,
										border: `1px solid ${COLORS.success}`,
										borderRadius: "var(--radius)",
										color: "#fff",
									}}
									formatter={(value: number | string, name: string) => {
										if (name === "avgTime") return [`${value}ms`, "Avg Time"];
										if (name === "errorRate")
											return [`${value}%`, "Error Rate"];
										return [value, name];
									}}
								/>
								<Scatter
									name="Models"
									data={modelPerformance}
									fill={COLORS.primary}
								>
									{modelPerformance.map((entry) => (
										<text
											key={`label-${entry.model}`}
											x={entry.avgTime}
											y={entry.errorRate}
											dy={-10}
											textAnchor="middle"
											className="text-xs fill-foreground"
										>
											{entry.model}
										</text>
									))}
								</Scatter>
							</ScatterChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>

				{/* Cost by Model */}
				<Card>
					<CardHeader>
						<CardTitle>Cost Analysis by Model</CardTitle>
						<CardDescription>
							Top models by cost in the last {timeRange}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer width="100%" height={300}>
							<BarChart data={costByModel} layout="vertical">
								<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
								<XAxis type="number" className="text-xs" />
								<YAxis
									dataKey="model"
									type="category"
									className="text-xs"
									width={120}
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: "var(--background)",
										border: "1px solid var(--border)",
										borderRadius: "var(--radius)",
									}}
									formatter={(value: number | string, name: string) => {
										if (name === "cost") return [`$${value}`, "Cost"];
										return [(value as number).toLocaleString(), "Requests"];
									}}
								/>
								<Bar
									dataKey="cost"
									fill={COLORS.primary}
									radius={[0, 4, 4, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			</div>

			{/* Beautiful Cumulative Chart - Only show in cumulative mode */}
			{viewMode === "cumulative" && analytics && (
				<Card className="bg-gradient-to-br from-background to-muted/10 border-muted">
					<CardHeader>
						<CardTitle className="text-2xl font-bold">
							Cumulative Growth Analysis
						</CardTitle>
						<CardDescription>
							Token usage vs. cost accumulation over time
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer width="100%" height={400}>
							<AreaChart
								data={data}
								margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
							>
								<defs>
									<linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
										<stop
											offset="0%"
											stopColor={COLORS.blue}
											stopOpacity={0.9}
										/>
										<stop
											offset="100%"
											stopColor={COLORS.blue}
											stopOpacity={0.1}
										/>
									</linearGradient>
									<linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
										<stop
											offset="0%"
											stopColor={COLORS.warning}
											stopOpacity={0.9}
										/>
										<stop
											offset="100%"
											stopColor={COLORS.warning}
											stopOpacity={0.1}
										/>
									</linearGradient>
									<filter id="glow">
										<feGaussianBlur stdDeviation="4" result="coloredBlur" />
										<feMerge>
											<feMergeNode in="coloredBlur" />
											<feMergeNode in="SourceGraphic" />
										</feMerge>
									</filter>
								</defs>
								<CartesianGrid
									strokeDasharray="3 3"
									stroke="rgba(255,255,255,0.1)"
								/>
								<XAxis
									dataKey="time"
									className="text-xs"
									stroke="rgba(255,255,255,0.5)"
								/>
								<YAxis
									yAxisId="tokens"
									className="text-xs"
									stroke={COLORS.blue}
								/>
								<YAxis
									yAxisId="cost"
									orientation="right"
									className="text-xs"
									stroke={COLORS.warning}
								/>
								<Tooltip
									labelClassName="font-bold"
									contentStyle={{
										backgroundColor: "rgba(0,0,0,0.8)",
										border: "1px solid rgba(255,255,255,0.2)",
										borderRadius: "8px",
										backdropFilter: "blur(8px)",
									}}
									formatter={(value: number | string, name: string) => {
										if (name === "Total Cost")
											return [`$${value}`, "Total Cost"];
										return [(value as number).toLocaleString(), "Total Tokens"];
									}}
								/>
								<Legend
									verticalAlign="top"
									height={36}
									iconType="rect"
									wrapperStyle={{
										paddingBottom: "20px",
									}}
								/>
								<Area
									yAxisId="tokens"
									type="monotone"
									dataKey="tokens"
									stroke={COLORS.blue}
									strokeWidth={3}
									fillOpacity={1}
									fill="url(#colorTokens)"
									filter="url(#glow)"
									name="Total Tokens"
								/>
								<Area
									yAxisId="cost"
									type="monotone"
									dataKey="cost"
									stroke={COLORS.warning}
									strokeWidth={3}
									fillOpacity={1}
									fill="url(#colorCost)"
									filter="url(#glow)"
									name="Total Cost"
								/>
							</AreaChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			)}

			{/* Cumulative Token Breakdown Ribbon Chart */}
			{viewMode === "cumulative" && analytics && tokenBreakdown.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Cumulative Token Composition</CardTitle>
						<CardDescription>Token type distribution over time</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-6">
							<div className="relative h-24 bg-muted rounded-lg overflow-hidden">
								{(() => {
									let offset = 0;
									return tokenBreakdown.map((item, index) => {
										const width = item.percentage;
										const currentOffset = offset;
										offset += width;
										return (
											<div
												key={item.type}
												className="absolute h-full transition-all duration-1000 hover:opacity-80"
												style={{
													left: `${currentOffset}%`,
													width: `${width}%`,
													background: `linear-gradient(135deg, ${
														index === 0
															? COLORS.blue
															: index === 1
																? COLORS.success
																: index === 2
																	? COLORS.warning
																	: COLORS.purple
													} 0%, ${
														index === 0
															? COLORS.purple
															: index === 1
																? COLORS.blue
																: index === 2
																	? COLORS.primary
																	: COLORS.warning
													} 100%)`,
												}}
											>
												<div className="flex items-center justify-center h-full">
													{width > 10 && (
														<span className="text-white font-medium text-xs">
															{item.percentage}%
														</span>
													)}
												</div>
											</div>
										);
									});
								})()}
							</div>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								{tokenBreakdown.map((item, index) => (
									<div key={item.type} className="flex items-center gap-2">
										<div
											className="w-3 h-3 rounded-full"
											style={{
												background:
													index === 0
														? COLORS.blue
														: index === 1
															? COLORS.success
															: index === 2
																? COLORS.warning
																: COLORS.purple,
											}}
										/>
										<div>
											<p className="text-xs text-muted-foreground">
												{item.type}
											</p>
											<p className="text-sm font-medium">
												{item.value.toLocaleString()}
											</p>
										</div>
									</div>
								))}
							</div>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
