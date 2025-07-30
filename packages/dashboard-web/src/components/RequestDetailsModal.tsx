import { formatCost, formatTimestamp, formatTokens } from "@ccflare/ui-common";
import { Eye } from "lucide-react";
import { useState } from "react";
import type { RequestPayload, RequestSummary } from "../api";
import { CopyButton } from "./CopyButton";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import { Badge } from "./ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface RequestDetailsModalProps {
	request: RequestPayload;
	summary: RequestSummary | undefined;
	isOpen: boolean;
	onClose: () => void;
}

export function RequestDetailsModal({
	request,
	summary,
	isOpen,
	onClose,
}: RequestDetailsModalProps) {
	const [beautifyMode, setBeautifyMode] = useState(true);

	const decodeBase64 = (str: string | null): string => {
		if (!str) return "No data";
		try {
			if (str === "[streamed]") {
				return "[Streaming data not captured]";
			}
			return atob(str);
		} catch (error) {
			console.error("Failed to decode base64:", error, "Input:", str);
			return `Failed to decode: ${str}`;
		}
	};

	const formatJson = (str: string): string => {
		try {
			const parsed = JSON.parse(str);
			return JSON.stringify(parsed, null, 2);
		} catch {
			// If it's not valid JSON, return as-is
			return str;
		}
	};

	const formatHeaders = (headers: Record<string, string>): string => {
		if (!beautifyMode) {
			return Object.entries(headers)
				.map(([key, value]) => `${key}: ${value}`)
				.join("\n");
		}
		return JSON.stringify(headers, null, 2);
	};

	const formatBody = (body: string | null): string => {
		const decoded = decodeBase64(body);
		if (!beautifyMode) return decoded;
		return formatJson(decoded);
	};

	const _isError = request.error || !request.meta.success;
	const statusCode = request.response?.status;

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Eye className="h-5 w-5" />
						Request Details
					</DialogTitle>
					<DialogDescription className="flex items-center justify-between">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="font-mono text-sm">
								{formatTimestamp(request.meta.timestamp)}
							</span>
							{statusCode && (
								<Badge
									variant={
										statusCode >= 200 && statusCode < 300
											? "success"
											: statusCode >= 400 && statusCode < 500
												? "warning"
												: "destructive"
									}
								>
									{statusCode}
								</Badge>
							)}
							{summary?.model && (
								<Badge variant="secondary">{summary.model}</Badge>
							)}
							{summary?.agentUsed && (
								<Badge variant="secondary">Agent: {summary.agentUsed}</Badge>
							)}
							{summary?.totalTokens && (
								<Badge variant="outline">
									{formatTokens(summary.totalTokens)} tokens
								</Badge>
							)}
							{summary?.costUsd && summary.costUsd > 0 && (
								<Badge variant="default">{formatCost(summary.costUsd)}</Badge>
							)}
							{request.meta.rateLimited && (
								<Badge variant="warning">Rate Limited</Badge>
							)}
						</div>
						<div className="flex items-center gap-2">
							<Label htmlFor="beautify-mode" className="text-sm">
								Beautify
							</Label>
							<Switch
								id="beautify-mode"
								checked={beautifyMode}
								onCheckedChange={setBeautifyMode}
							/>
						</div>
					</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue="request" className="flex-1 overflow-hidden">
					<TabsList className="grid w-full grid-cols-4">
						<TabsTrigger value="request">Request</TabsTrigger>
						<TabsTrigger value="response">Response</TabsTrigger>
						<TabsTrigger value="metadata">Metadata</TabsTrigger>
						<TabsTrigger value="tokens">Token Usage</TabsTrigger>
					</TabsList>

					<TabsContent
						value="request"
						className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]"
					>
						<div>
							<div className="flex items-center justify-between mb-2">
								<h3 className="font-semibold">Headers</h3>
								<CopyButton
									variant="ghost"
									size="sm"
									getValue={() => formatHeaders(request.request.headers)}
								>
									Copy
								</CopyButton>
							</div>
							<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
								{formatHeaders(request.request.headers)}
							</pre>
						</div>

						{request.request.body && (
							<div>
								<div className="flex items-center justify-between mb-2">
									<h3 className="font-semibold">Body</h3>
									<CopyButton
										variant="ghost"
										size="sm"
										getValue={() => formatBody(request.request.body)}
									>
										Copy
									</CopyButton>
								</div>
								<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
									{formatBody(request.request.body)}
								</pre>
							</div>
						)}
					</TabsContent>

					<TabsContent
						value="response"
						className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]"
					>
						{request.response ? (
							<>
								<div>
									<div className="flex items-center justify-between mb-2">
										<h3 className="font-semibold">Headers</h3>
										<CopyButton
											variant="ghost"
											size="sm"
											getValue={() =>
												request.response
													? formatHeaders(request.response.headers)
													: ""
											}
										>
											Copy
										</CopyButton>
									</div>
									<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
										{formatHeaders(request.response.headers)}
									</pre>
								</div>

								{request.response.body && (
									<div>
										<div className="flex items-center justify-between mb-2">
											<h3 className="font-semibold">Body</h3>
											<CopyButton
												variant="ghost"
												size="sm"
												getValue={() =>
													request.response
														? formatBody(request.response.body)
														: ""
												}
											>
												Copy
											</CopyButton>
										</div>
										<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
											{formatBody(request.response.body)}
										</pre>
									</div>
								)}
							</>
						) : (
							<div className="text-center text-muted-foreground py-8">
								{request.error ? (
									<>
										<p className="text-destructive font-medium">
											Error: {request.error}
										</p>
										<p className="mt-2">No response data available</p>
									</>
								) : (
									<p>No response data available</p>
								)}
							</div>
						)}
					</TabsContent>

					<TabsContent
						value="metadata"
						className="mt-4 overflow-y-auto max-h-[60vh]"
					>
						<div>
							<div className="flex items-center justify-between mb-2">
								<h3 className="font-semibold">Request Metadata</h3>
								<CopyButton
									variant="ghost"
									size="sm"
									getValue={() =>
										beautifyMode
											? JSON.stringify(request.meta, null, 2)
											: JSON.stringify(request.meta)
									}
								>
									Copy
								</CopyButton>
							</div>
							<pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
								{beautifyMode
									? JSON.stringify(request.meta, null, 2)
									: JSON.stringify(request.meta)}
							</pre>
						</div>
					</TabsContent>

					<TabsContent
						value="tokens"
						className="mt-4 overflow-y-auto max-h-[60vh]"
					>
						<TokenUsageDisplay summary={summary} />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
