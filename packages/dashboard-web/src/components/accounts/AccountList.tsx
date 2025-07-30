import type { Account } from "../../api";
import { AccountListItem } from "./AccountListItem";

interface AccountListProps {
	accounts: Account[] | undefined;
	onPauseToggle: (account: Account) => void;
	onRemove: (name: string) => void;
}

export function AccountList({
	accounts,
	onPauseToggle,
	onRemove,
}: AccountListProps) {
	if (!accounts || accounts.length === 0) {
		return <p className="text-muted-foreground">No accounts configured</p>;
	}

	return (
		<div className="space-y-2">
			{accounts.map((account) => (
				<AccountListItem
					key={account.name}
					account={account}
					onPauseToggle={onPauseToggle}
					onRemove={onRemove}
				/>
			))}
		</div>
	);
}
