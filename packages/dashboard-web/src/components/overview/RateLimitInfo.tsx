import type { AccountResponse } from "@ccflare/types";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";

interface RateLimitInfoProps {
	accounts: AccountResponse[];
}

export function RateLimitInfo({ accounts }: RateLimitInfoProps) {
	const rateLimitedAccounts = accounts.filter((acc) => {
		const status = acc.rateLimitStatus.toLowerCase();
		return (
			status !== "ok" && status !== "paused" && !status.startsWith("allowed")
		);
	});

	if (rateLimitedAccounts.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Rate Limit Info</CardTitle>
				<CardDescription>Rate limit information about accounts</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{rateLimitedAccounts.map((account) => {
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

						const statusLower = account.rateLimitStatus.toLowerCase();
						const isHardLimit =
							statusLower.includes("hard") ||
							(statusLower.includes("limit") &&
								!statusLower.includes("warning"));
						const bgClass = isHardLimit ? "bg-destructive/10" : "bg-warning/10";
						const iconColor = isHardLimit ? "text-destructive" : "text-warning";

						return (
							<div
								key={account.id}
								className={`flex items-center justify-between p-4 rounded-lg ${bgClass}`}
							>
								<div className="flex items-center gap-3">
									<AlertCircle className={`h-5 w-5 ${iconColor}`} />
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
	);
}
