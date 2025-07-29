import { ChevronDown, ChevronRight, Eye, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type RequestPayload, type RequestSummary } from "../api";
import { CopyButton } from "./CopyButton";
import { RequestDetailsModal } from "./RequestDetailsModal";
import { TokenUsageDisplay } from "./TokenUsageDisplay";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";

export function RequestsTab() {
	const [requests, setRequests] = useState<RequestPayload[]>([]);
	const [summaries, setSummaries] = useState<Map<string, RequestSummary>>(
		new Map(),
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [expandedRequests, setExpandedRequests] = useState<Set<string>>(
		new Set(),
	);
	const [modalRequest, setModalRequest] = useState<RequestPayload | null>(null);

	const loadRequests = useCallback(async () => {
		try {
			// Use the optimized detail handler that returns summary data without full payloads
			const detailData = await api.getRequestsDetail(200);
			setRequests(detailData);

			// Extract summary data from the response
			const summaryMap = new Map<string, RequestSummary>();
			detailData.forEach((request: any) => {
				if (request.summary) {
					summaryMap.set(request.id, request.summary);
				}
			});
			setSummaries(summaryMap);

			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load requests");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadRequests();
		const interval = setInterval(loadRequests, 10000);
		return () => clearInterval(interval);
	}, [loadRequests]);

	const toggleExpanded = (id: string) => {
		setExpandedRequests((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const decodeBase64 = (str: string | null): string => {
		if (!str) return "No data";
		try {
			// Handle edge cases like "[streamed]" from older data
			if (str === "[streamed]") {
				return "[Streaming data not captured]";
			}
			return atob(str);
		} catch (error) {
			console.error("Failed to decode base64:", error, "Input:", str);
			return `Failed to decode: ${str}`;
		}
	};

	/**
	 * Copy the given request to the clipboard as pretty-printed JSON, with
	 * any base64-encoded bodies already decoded for easier debugging.
	 */
	// copyRequest helper removed – handled inline by CopyButton

	if (loading) {
		return (
			<Card>
				<CardContent className="pt-6">
					<p className="text-muted-foreground">Loading requests...</p>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent className="pt-6">
					<p className="text-destructive">Error: {error}</p>
					<Button
						onClick={loadRequests}
						variant="outline"
						size="sm"
						className="mt-2"
					>
						<RefreshCw className="mr-2 h-4 w-4" />
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Request History</CardTitle>
						<CardDescription>
							Detailed request and response data (last 200)
						</CardDescription>
					</div>
					<Button onClick={loadRequests} variant="ghost" size="sm">
						<RefreshCw className="h-4 w-4" />
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{requests.length === 0 ? (
					<p className="text-muted-foreground">No requests found</p>
				) : (
					<div className="space-y-2">
						{requests.map((request) => {
							const isExpanded = expandedRequests.has(request.id);
							const isError = request.error || !request.meta.success;
							const statusCode = request.response?.status;
							const summary = summaries.get(request.id);

							return (
								<div
									key={request.id}
									className={`border rounded-lg p-3 ${
										isError ? "border-destructive/50" : "border-border"
									}`}
								>
									<button
										type="button"
										className="flex items-center justify-between cursor-pointer w-full text-left"
										onClick={() => toggleExpanded(request.id)}
									>
										<div className="flex items-center gap-2 flex-wrap">
											{isExpanded ? (
												<ChevronDown className="h-4 w-4" />
											) : (
												<ChevronRight className="h-4 w-4" />
											)}
											<span className="text-sm font-mono">
												{new Date(request.meta.timestamp).toLocaleTimeString()}
											</span>
											{statusCode && (
												<span
													className={`text-sm font-medium ${
														statusCode >= 200 && statusCode < 300
															? "text-green-600"
															: statusCode >= 400 && statusCode < 500
																? "text-yellow-600"
																: "text-red-600"
													}`}
												>
													{statusCode}
												</span>
											)}
											{summary?.model && (
												<Badge variant="secondary" className="text-xs">
													{summary.model}
												</Badge>
											)}
											{summary?.totalTokens && (
												<Badge variant="outline" className="text-xs">
													{summary.totalTokens.toLocaleString()} tokens
												</Badge>
											)}
											{summary?.costUsd && summary.costUsd > 0 && (
												<Badge variant="default" className="text-xs">
													${summary.costUsd.toFixed(4)}
												</Badge>
											)}
											{(request.meta.accountName || request.meta.accountId) && (
												<span className="text-sm text-muted-foreground">
													via{" "}
													{request.meta.accountName ||
														`${request.meta.accountId?.slice(0, 8)}...`}
												</span>
											)}
											{request.meta.rateLimited && (
												<Badge variant="warning" className="text-xs">
													Rate Limited
												</Badge>
											)}
											{request.error && (
												<span className="text-sm text-destructive">
													Error: {request.error}
												</span>
											)}
										</div>
										<div className="text-sm text-muted-foreground flex items-center gap-2">
											{summary?.responseTimeMs && (
												<span>{summary.responseTimeMs}ms</span>
											)}
											{request.meta.retry !== undefined &&
												request.meta.retry > 0 && (
													<span>Retry {request.meta.retry}</span>
												)}
											<span>ID: {request.id.slice(0, 8)}...</span>
										</div>
									</button>

									{/* Action buttons */}
									<div className="flex justify-end gap-2 mt-2">
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setModalRequest(request)}
											title="View Details"
										>
											<Eye className="h-4 w-4" />
										</Button>
										<CopyButton
											variant="ghost"
											size="icon"
											title="Copy as JSON"
											getValue={() => {
												const decoded: RequestPayload & { decoded?: true } = {
													...request,
													request: {
														...request.request,
														body: request.request.body
															? decodeBase64(request.request.body)
															: null,
													},
													response: request.response
														? {
																...request.response,
																body: request.response.body
																	? decodeBase64(request.response.body)
																	: null,
															}
														: null,
													decoded: true,
												};
												return JSON.stringify(decoded, null, 2);
											}}
										/>
									</div>

									{isExpanded && (
										<div className="mt-3 space-y-3">
											<TokenUsageDisplay summary={summary} />
											<Button
												variant="outline"
												size="sm"
												onClick={() => setModalRequest(request)}
												className="w-full"
											>
												<Eye className="h-4 w-4 mr-2" />
												View More Details
											</Button>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</CardContent>

			{modalRequest && (
				<RequestDetailsModal
					request={modalRequest}
					summary={summaries.get(modalRequest.id)}
					isOpen={true}
					onClose={() => setModalRequest(null)}
				/>
			)}
		</Card>
	);
}
