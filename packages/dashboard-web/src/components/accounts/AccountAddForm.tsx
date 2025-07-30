import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

interface AccountAddFormProps {
	onAddAccount: (params: {
		name: string;
		mode: "max" | "console";
		tier: number;
	}) => Promise<{ authUrl: string; sessionId: string }>;
	onCompleteAccount: (params: {
		sessionId: string;
		code: string;
	}) => Promise<void>;
	onCancel: () => void;
	onSuccess: () => void;
	onError: (error: string) => void;
}

export function AccountAddForm({
	onAddAccount,
	onCompleteAccount,
	onCancel,
	onSuccess,
	onError,
}: AccountAddFormProps) {
	const [authStep, setAuthStep] = useState<"form" | "code">("form");
	const [authCode, setAuthCode] = useState("");
	const [sessionId, setSessionId] = useState("");
	const [newAccount, setNewAccount] = useState({
		name: "",
		mode: "max" as "max" | "console",
		tier: 1,
	});

	const handleAddAccount = async () => {
		if (!newAccount.name) {
			onError("Account name is required");
			return;
		}
		// Step 1: Initialize OAuth flow
		const { authUrl, sessionId } = await onAddAccount(newAccount);
		setSessionId(sessionId);

		// Open auth URL in new tab
		if (typeof window !== "undefined") {
			window.open(authUrl, "_blank");
		}

		// Move to code entry step
		setAuthStep("code");
	};

	const handleCodeSubmit = async () => {
		if (!authCode) {
			onError("Authorization code is required");
			return;
		}
		// Step 2: Complete OAuth flow
		await onCompleteAccount({
			sessionId,
			code: authCode,
		});

		// Success! Reset form
		setAuthStep("form");
		setAuthCode("");
		setSessionId("");
		setNewAccount({ name: "", mode: "max", tier: 1 });
		onSuccess();
	};

	const handleCancel = () => {
		setAuthStep("form");
		setAuthCode("");
		setSessionId("");
		setNewAccount({ name: "", mode: "max", tier: 1 });
		onCancel();
	};

	return (
		<div className="space-y-4 mb-6 p-4 border rounded-lg">
			<h4 className="font-medium">
				{authStep === "form" ? "Add New Account" : "Enter Authorization Code"}
			</h4>
			{authStep === "form" && (
				<>
					<div className="space-y-2">
						<Label htmlFor="name">Account Name</Label>
						<Input
							id="name"
							value={newAccount.name}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setNewAccount({
									...newAccount,
									name: (e.target as HTMLInputElement).value,
								})
							}
							placeholder="e.g., work-account"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="mode">Mode</Label>
						<Select
							value={newAccount.mode}
							onValueChange={(value: "max" | "console") =>
								setNewAccount({ ...newAccount, mode: value })
							}
						>
							<SelectTrigger id="mode">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="max">Max (Recommended)</SelectItem>
								<SelectItem value="console">Console</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="tier">Tier</Label>
						<Select
							value={String(newAccount.tier)}
							onValueChange={(value: string) =>
								setNewAccount({ ...newAccount, tier: parseInt(value) })
							}
						>
							<SelectTrigger id="tier">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="1">Tier 1 (Default)</SelectItem>
								<SelectItem value="5">Tier 5</SelectItem>
								<SelectItem value="20">Tier 20</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</>
			)}
			{authStep === "form" ? (
				<div className="flex gap-2">
					<Button onClick={handleAddAccount}>Continue</Button>
					<Button variant="outline" onClick={handleCancel}>
						Cancel
					</Button>
				</div>
			) : (
				<>
					<div className="space-y-2">
						<p className="text-sm text-muted-foreground">
							A new browser tab has opened for authentication. After
							authorizing, copy the code and paste it below.
						</p>
						<Label htmlFor="code">Authorization Code</Label>
						<Input
							id="code"
							value={authCode}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setAuthCode((e.target as HTMLInputElement).value)
							}
							placeholder="Paste authorization code here"
						/>
					</div>
					<div className="flex gap-2">
						<Button onClick={handleCodeSubmit}>Complete Setup</Button>
						<Button variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
