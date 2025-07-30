import { CalendarDays, RefreshCw } from "lucide-react";
import type { TimeRange } from "../../constants";
import { Button } from "../ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { AnalyticsFilters, type FilterState } from "./AnalyticsFilters";

interface AnalyticsControlsProps {
	timeRange: TimeRange;
	setTimeRange: (range: TimeRange) => void;
	viewMode: "normal" | "cumulative";
	setViewMode: (mode: "normal" | "cumulative") => void;
	filters: FilterState;
	setFilters: (filters: FilterState) => void;
	availableAccounts: string[];
	availableModels: string[];
	activeFilterCount: number;
	filterOpen: boolean;
	setFilterOpen: (open: boolean) => void;
	loading: boolean;
	onRefresh: () => void;
}

export function AnalyticsControls({
	timeRange,
	setTimeRange,
	viewMode,
	setViewMode,
	filters,
	setFilters,
	availableAccounts,
	availableModels,
	activeFilterCount,
	filterOpen,
	setFilterOpen,
	loading,
	onRefresh,
}: AnalyticsControlsProps) {
	return (
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

				<AnalyticsFilters
					filters={filters}
					setFilters={setFilters}
					availableAccounts={availableAccounts}
					availableModels={availableModels}
					activeFilterCount={activeFilterCount}
					filterOpen={filterOpen}
					setFilterOpen={setFilterOpen}
				/>
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
					onClick={onRefresh}
					disabled={loading}
				>
					<RefreshCw
						className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
					/>
					Refresh
				</Button>
			</div>
		</div>
	);
}
