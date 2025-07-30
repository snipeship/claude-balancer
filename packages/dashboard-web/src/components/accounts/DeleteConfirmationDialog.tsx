import { AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface DeleteConfirmationDialogProps {
	accountName: string;
	confirmInput: string;
	onConfirmInputChange: (value: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
}

export function DeleteConfirmationDialog({
	accountName,
	confirmInput,
	onConfirmInputChange,
	onConfirm,
	onCancel,
}: DeleteConfirmationDialogProps) {
	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Confirm Account Removal</CardTitle>
					<CardDescription>This action cannot be undone.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
						<div className="flex items-center gap-2 text-destructive">
							<AlertCircle className="h-5 w-5" />
							<p className="font-medium">Warning</p>
						</div>
						<p className="text-sm mt-2">
							You are about to permanently remove the account '{accountName}'.
							This will delete all associated data and cannot be recovered.
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirm-input">
							Type{" "}
							<span className="font-mono font-semibold">{accountName}</span> to
							confirm:
						</Label>
						<Input
							id="confirm-input"
							value={confirmInput}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								onConfirmInputChange((e.target as HTMLInputElement).value)
							}
							placeholder="Enter account name"
							autoComplete="off"
						/>
					</div>
					<div className="flex gap-2">
						<Button
							variant="destructive"
							onClick={onConfirm}
							disabled={confirmInput !== accountName}
						>
							Delete Account
						</Button>
						<Button variant="outline" onClick={onCancel}>
							Cancel
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
