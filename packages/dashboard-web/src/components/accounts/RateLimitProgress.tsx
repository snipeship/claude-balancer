import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { Progress } from "../ui/progress";

interface RateLimitProgressProps {
	resetIso: string | null;
	className?: string;
}

const WINDOW_MS = 5 * 60 * 60 * 1000; // 5 hours in milliseconds

export function RateLimitProgress({
	resetIso,
	className,
}: RateLimitProgressProps) {
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), 10000); // Update every 10 seconds
		return () => clearInterval(interval);
	}, []);

	if (!resetIso) return null;

	const resetTime = new Date(resetIso).getTime();
	const startTime = resetTime - WINDOW_MS;
	const elapsed = now - startTime;
	const percentage = Math.min(100, Math.max(0, (elapsed / WINDOW_MS) * 100));
	const remainingMs = Math.max(0, resetTime - now);
	const remainingMinutes = Math.ceil(remainingMs / 60000);
	const remainingHours = Math.floor(remainingMinutes / 60);
	const remainingMins = remainingMinutes % 60;

	// Format time remaining
	let timeText = "";
	if (remainingMs <= 0) {
		timeText = "Ready to refresh";
	} else if (remainingHours > 0) {
		timeText = `${remainingHours}h ${remainingMins}m until refresh`;
	} else {
		timeText = `${remainingMinutes}m until refresh`;
	}

	return (
		<div className={cn("space-y-2", className)}>
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">Rate limit window</span>
				<span className="text-xs font-medium text-muted-foreground">
					{percentage.toFixed(0)}%
				</span>
			</div>
			<Progress value={percentage} className="h-2" />
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">{timeText}</span>
				{remainingMs > 0 && (
					<span className="text-xs text-muted-foreground">
						Resets at {new Date(resetTime).toLocaleTimeString()}
					</span>
				)}
			</div>
		</div>
	);
}
