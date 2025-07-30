import { AccountPresenter } from "@ccflare/ui-common";
import { AlertCircle, CheckCircle, Pause, Play, Trash2 } from "lucide-react";
import type { Account } from "../../api";
import { Button } from "../ui/button";

interface AccountListItemProps {
	account: Account;
	onPauseToggle: (account: Account) => void;
	onRemove: (name: string) => void;
}

export function AccountListItem({
	account,
	onPauseToggle,
	onRemove,
}: AccountListItemProps) {
	const presenter = new AccountPresenter(account);

	return (
		<div
			key={account.name}
			className="flex items-center justify-between p-4 border rounded-lg"
		>
			<div className="flex items-center gap-4">
				<div>
					<p className="font-medium">{account.name}</p>
					<p className="text-sm text-muted-foreground">
						{account.provider} • {presenter.tierDisplay}
					</p>
				</div>
				<div className="flex items-center gap-2">
					{presenter.tokenStatus === "valid" ? (
						<CheckCircle className="h-4 w-4 text-green-600" />
					) : (
						<AlertCircle className="h-4 w-4 text-yellow-600" />
					)}
					<span className="text-sm">{presenter.requestCount} requests</span>
					{presenter.isPaused && (
						<span className="text-sm text-muted-foreground">Paused</span>
					)}
					{!presenter.isPaused && presenter.rateLimitStatus !== "OK" && (
						<span className="text-sm text-destructive">
							{presenter.rateLimitStatus}
						</span>
					)}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onPauseToggle(account)}
					title={account.paused ? "Resume account" : "Pause account"}
				>
					{account.paused ? (
						<Play className="h-4 w-4" />
					) : (
						<Pause className="h-4 w-4" />
					)}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onRemove(account.name)}
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
