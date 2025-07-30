import { Clock } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

interface TimeRangeSelectorProps {
	value: string;
	onChange: (value: string) => void;
}

const TIME_RANGES = [
	{ value: "1h", label: "Last hour" },
	{ value: "6h", label: "Last 6 hours" },
	{ value: "24h", label: "Last 24 hours" },
	{ value: "7d", label: "Last 7 days" },
	{ value: "30d", label: "Last 30 days" },
];

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
	return (
		<div className="flex items-center gap-2">
			<Clock className="h-4 w-4 text-muted-foreground" />
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className="w-[150px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{TIME_RANGES.map((range) => (
						<SelectItem key={range.value} value={range.value}>
							{range.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
