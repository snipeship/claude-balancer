import { useState } from "react";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

interface RenameAccountDialogProps {
	isOpen: boolean;
	currentName: string;
	onClose: () => void;
	onRename: (newName: string) => void;
	isLoading?: boolean;
}

export function RenameAccountDialog({
	isOpen,
	currentName,
	onClose,
	onRename,
	isLoading = false,
}: RenameAccountDialogProps) {
	const [newName, setNewName] = useState(currentName);
	const [error, setError] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		// Validate new name
		const trimmedName = newName.trim();
		if (!trimmedName) {
			setError("Account name cannot be empty");
			return;
		}
		if (trimmedName === currentName) {
			setError("New name must be different from current name");
			return;
		}
		if (trimmedName.length > 100) {
			setError("Account name must be 100 characters or less");
			return;
		}

		setError("");
		onRename(trimmedName);
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setNewName(currentName);
			setError("");
			onClose();
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Rename Account</DialogTitle>
						<DialogDescription>
							Enter a new name for account "{currentName}"
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="new-name">New Name</Label>
							<Input
								id="new-name"
								value={newName}
								onChange={(e) => {
									setNewName(e.target.value);
									setError("");
								}}
								placeholder="Enter new account name"
								autoFocus
								disabled={isLoading}
							/>
							{error && <p className="text-sm text-destructive">{error}</p>}
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? "Renaming..." : "Rename"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
