import { Filter } from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";

export interface FilterState {
	accounts: string[];
	models: string[];
	status: "all" | "success" | "error";
}

interface AnalyticsFiltersProps {
	filters: FilterState;
	setFilters: (filters: FilterState) => void;
	availableAccounts: string[];
	availableModels: string[];
	activeFilterCount: number;
	filterOpen: boolean;
	setFilterOpen: (open: boolean) => void;
}

export function AnalyticsFilters({
	filters,
	setFilters,
	availableAccounts,
	availableModels,
	activeFilterCount,
	filterOpen,
	setFilterOpen,
}: AnalyticsFiltersProps) {
	return (
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
														models: filters.models.filter((m) => m !== model),
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
	);
}
