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

	useInput((input, key) => {
		if (key.escape || input === "q") {
			if (viewDetails) {
				setViewDetails(false);
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
					setViewDetails(true);
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

	if (viewDetails && selectedRequest) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text color="cyan" bold>
						📜 Request Details
					</Text>
				</Box>

				<Box flexDirection="column">
					<Text bold>ID: {selectedRequest.id}</Text>
					<Text bold>
						Time: {formatTimestamp(selectedRequest.meta.timestamp)}
					</Text>

					{selectedRequest.meta.accountId && (
						<Text>Account: {selectedRequest.meta.accountId}</Text>
					)}

					{selectedRequest.meta.retry !== undefined &&
						selectedRequest.meta.retry > 0 && (
							<Text color="yellow">Retry: {selectedRequest.meta.retry}</Text>
						)}

					{selectedRequest.meta.rateLimited && (
						<Text color="orange">Rate Limited</Text>
					)}

					{selectedRequest.error && (
						<Text color="red">Error: {selectedRequest.error}</Text>
					)}

					<Box marginTop={1}>
						<Text bold>Request Headers:</Text>
						<Box marginLeft={2} flexDirection="column">
							{Object.entries(selectedRequest.request.headers)
								.slice(0, 5)
								.map(([k, v]) => (
									<Text key={k} dimColor>
										{k}: {v.length > 50 ? `${v.substring(0, 50)}...` : v}
									</Text>
								))}
						</Box>
					</Box>

					{selectedRequest.request.body && (
						<Box marginTop={1}>
							<Text bold>Request Body:</Text>
							<Box marginLeft={2}>
								<Text dimColor>
									{decodeBase64(selectedRequest.request.body).substring(0, 200)}
									...
								</Text>
							</Box>
						</Box>
					)}

					{selectedRequest.response && (
						<>
							<Box marginTop={1}>
								<Text bold>
									Response Status:{" "}
									<Text
										color={
											selectedRequest.response.status >= 200 &&
											selectedRequest.response.status < 300
												? "green"
												: selectedRequest.response.status >= 400 &&
														selectedRequest.response.status < 500
													? "yellow"
													: "red"
										}
									>
										{selectedRequest.response.status}
									</Text>
								</Text>
							</Box>

							{selectedRequest.response.body && (
								<Box marginTop={1}>
									<Text bold>Response Body:</Text>
									<Box marginLeft={2}>
										<Text dimColor>
											{decodeBase64(selectedRequest.response.body).substring(
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
