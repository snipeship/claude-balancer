import * as tuiCore from "@ccflare/tui-core";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useState } from "react";

interface RequestsScreenProps {
	onBack: () => void;
}

export function RequestsScreen({ onBack }: RequestsScreenProps) {
	const [requests, setRequests] = useState<tuiCore.RequestPayload[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [viewDetails, setViewDetails] = useState(false);
	const [selectedRequestDetails, setSelectedRequestDetails] = useState<tuiCore.RequestPayload | null>(null);
	const [loadingDetails, setLoadingDetails] = useState(false);

	useInput((input, key) => {
		if (key.escape || input === "q") {
			if (viewDetails) {
				setViewDetails(false);
				setSelectedRequestDetails(null);
			} else {
				onBack();
			}
		}

		if (!viewDetails) {
			if (key.upArrow) {
				setSelectedIndex((prev) => Math.max(0, prev - 1));
			}
			if (key.downArrow) {
				setSelectedIndex((prev) => Math.min(requests.length - 1, prev + 1));
			}
			if (key.return || input === " ") {
				if (requests.length > 0) {
					loadRequestDetails(requests[selectedIndex]);
				}
			}
			if (input === "r") {
				loadRequests();
			}
		}
	});

	const loadRequests = useCallback(async () => {
		try {
			const data = await tuiCore.getRequests(50);
			setRequests(data);
			setLoading(false);
		} catch (_error) {
			setLoading(false);
		}
	}, []);

	const loadRequestDetails = useCallback(async (request: tuiCore.RequestPayload) => {
		setLoadingDetails(true);
		setViewDetails(true);
		try {
			// Try to get full payload data
			const fullPayload = await tuiCore.getRequestPayload(request.id);
			if (fullPayload) {
				setSelectedRequestDetails(fullPayload);
			} else {
				// Fallback to summary data with empty request/response
				setSelectedRequestDetails({
					...request,
					request: { headers: {}, body: null },
					response: request.response || null,
				});
			}
		} catch (_error) {
			// Fallback to summary data
			setSelectedRequestDetails({
				...request,
				request: { headers: {}, body: null },
				response: request.response || null,
			});
		} finally {
			setLoadingDetails(false);
		}
	}, []);

	useEffect(() => {
		loadRequests();
		const interval = setInterval(loadRequests, 10000); // Auto-refresh every 10 seconds
		return () => clearInterval(interval);
	}, [loadRequests]);

	const formatTimestamp = (ts: number): string => {
		return new Date(ts).toLocaleTimeString();
	};

	const decodeBase64 = (str: string | null): string => {
		if (!str) return "No data";
		try {
			return Buffer.from(str, "base64").toString();
		} catch {
			return "Failed to decode";
		}
	};

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="cyan" bold>
					📜 Requests
				</Text>
				<Text dimColor>Loading...</Text>
			</Box>
		);
	}

	const selectedRequest = requests[selectedIndex];

	if (viewDetails) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text color="cyan" bold>
						📜 Request Details
					</Text>
				</Box>

				{loadingDetails ? (
					<Text dimColor>Loading request details...</Text>
				) : selectedRequestDetails ? (
					<Box flexDirection="column">
						<Text bold>ID: {selectedRequestDetails.id}</Text>
					<Text bold>
						Time: {formatTimestamp(selectedRequestDetails.meta.timestamp)}
					</Text>

					{selectedRequestDetails.meta.accountId && (
						<Text>Account: {selectedRequestDetails.meta.accountId}</Text>
					)}

					{selectedRequestDetails.meta.retry !== undefined &&
						selectedRequestDetails.meta.retry > 0 && (
							<Text color="yellow">Retry: {selectedRequestDetails.meta.retry}</Text>
						)}

					{selectedRequestDetails.meta.rateLimited && (
						<Text color="orange">Rate Limited</Text>
					)}

					{selectedRequestDetails.error && (
						<Text color="red">Error: {selectedRequestDetails.error}</Text>
					)}

					<Box marginTop={1}>
						<Text bold>Request Headers:</Text>
						<Box marginLeft={2} flexDirection="column">
							{selectedRequestDetails.request.headers && Object.keys(selectedRequestDetails.request.headers).length > 0 ? (
								Object.entries(selectedRequestDetails.request.headers)
									.slice(0, 5)
									.map(([k, v]) => (
										<Text key={k} dimColor>
											{k}: {v.length > 50 ? `${v.substring(0, 50)}...` : v}
										</Text>
									))
							) : (
								<Text dimColor>No headers available (summary view)</Text>
							)}
						</Box>
					</Box>

					<Box marginTop={1}>
						<Text bold>Request Body:</Text>
						<Box marginLeft={2}>
							{selectedRequestDetails.request.body ? (
								<Text dimColor>
									{decodeBase64(selectedRequestDetails.request.body).substring(0, 200)}
									...
								</Text>
							) : (
								<Text dimColor>No body available (summary view)</Text>
							)}
						</Box>
					</Box>

					{selectedRequestDetails.response && (
						<>
							<Box marginTop={1}>
								<Text bold>
									Response Status:{" "}
									<Text
										color={
											selectedRequestDetails.response.status >= 200 &&
											selectedRequestDetails.response.status < 300
												? "green"
												: selectedRequestDetails.response.status >= 400 &&
														selectedRequestDetails.response.status < 500
													? "yellow"
													: "red"
										}
									>
										{selectedRequestDetails.response.status}
									</Text>
								</Text>
							</Box>

							{selectedRequestDetails.response.body && (
								<Box marginTop={1}>
									<Text bold>Response Body:</Text>
									<Box marginLeft={2}>
										<Text dimColor>
											{decodeBase64(selectedRequestDetails.response.body).substring(
												0,
												200,
											)}
											...
										</Text>
									</Box>
								</Box>
							)}
						</>
					)}
				</Box>

				<Box marginTop={2}>
					<Text dimColor>Press 'q' or ESC to go back</Text>
				</Box>
			) : (
				<Box flexDirection="column">
					<Text dimColor>No request details available</Text>
					<Box marginTop={2}>
						<Text dimColor>Press 'q' or ESC to go back</Text>
					</Box>
				</Box>
			)}
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text color="cyan" bold>
					📜 Request History
				</Text>
				<Text dimColor>Use ↑/↓ to navigate, ENTER to view details</Text>
			</Box>

			{requests.length === 0 ? (
				<Text dimColor>No requests found</Text>
			) : (
				<Box flexDirection="column">
					{requests.slice(0, 15).map((req, index) => {
						const isSelected = index === selectedIndex;
						const isError = req.error || !req.meta.success;
						const statusCode = req.response?.status;

						return (
							<Box key={req.id}>
								<Text
									color={isSelected ? "cyan" : undefined}
									inverse={isSelected}
								>
									{isSelected ? "▶ " : "  "}
									{formatTimestamp(req.meta.timestamp)} -{" "}
									{statusCode ? (
										<Text
											color={
												statusCode >= 200 && statusCode < 300
													? "green"
													: statusCode >= 400 && statusCode < 500
														? "yellow"
														: "red"
											}
										>
											{statusCode}
										</Text>
									) : (
										<Text color="red">ERROR</Text>
									)}
									{" - "}
									{req.meta.accountId
										? `${req.meta.accountId.slice(0, 8)}...`
										: "No Account"}
									{req.meta.rateLimited && " [RATE LIMITED]"}
									{isError &&
										req.error &&
										` - ${req.error.substring(0, 30)}...`}
								</Text>
							</Box>
						);
					})}

					{requests.length > 15 && (
						<Box marginTop={1}>
							<Text dimColor>... and {requests.length - 15} more requests</Text>
						</Box>
					)}
				</Box>
			)}

			<Box marginTop={2}>
				<Text dimColor>Press 'r' to refresh • 'q' or ESC to go back</Text>
			</Box>
		</Box>
	);
}
