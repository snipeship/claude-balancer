import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Account, RequestPayload, RequestResponse } from "../api";
import { queryKeys } from "../lib/query-keys";

export function useRequestStream(limit = 200) {
	const queryClient = useQueryClient();

	useEffect(() => {
		let es: EventSource | null = null;
		let retries = 0;
		let reconnectTimeout: NodeJS.Timeout | null = null;

		const connect = () => {
			// Clear any existing timeout
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}

			es = new EventSource("/api/requests/stream");

			es.addEventListener("open", () => {
				// Reset retry count on successful connection
				retries = 0;
				console.log("SSE connection established");
			});

			es.addEventListener("message", (ev) => {
				const evt = JSON.parse(ev.data) as
					| {
							type: "start";
							id: string;
							method: string;
							path: string;
							timestamp: number;
							accountId: string | null;
							statusCode: number;
							agentUsed: string | null;
					  }
					| { type: "summary"; payload: RequestResponse };

				queryClient.setQueryData(
					queryKeys.requests(limit),
					(
						current:
							| {
									requests: RequestPayload[];
									detailsMap: Map<string, RequestResponse> | RequestResponse[];
							  }
							| undefined,
					) => {
						if (!current) return current;

						// Ensure detailsMap is a Map
						const currentDetailsMap =
							current.detailsMap instanceof Map
								? current.detailsMap
								: new Map(
										(current.detailsMap as RequestResponse[]).map((s) => [
											s.id,
											s,
										]),
									);

						if (evt.type === "start") {
							// Look up account name from cache
							const accounts = queryClient.getQueryData<Account[]>(
								queryKeys.accounts(),
							);
							const account = accounts?.find((a) => a.id === evt.accountId);

							// Create a lightweight placeholder payload
							const placeholder: RequestPayload = {
								id: evt.id,
								request: { headers: {}, body: null },
								response: {
									status: evt.statusCode,
									headers: {},
									body: null,
								},
								meta: {
									timestamp: evt.timestamp,
									path: evt.path,
									method: evt.method,
									accountId: evt.accountId || undefined,
									accountName: account?.name,
									success: false,
									pending: true,
									agentUsed: evt.agentUsed || undefined,
								},
							};

							// Check if this request already exists
							const existingIndex = current.requests.findIndex(
								(r) => r.id === evt.id,
							);
							if (existingIndex >= 0) {
								// Update existing placeholder
								const newRequests = [...current.requests];
								newRequests[existingIndex] = placeholder;
								return {
									...current,
									requests: newRequests,
									detailsMap: currentDetailsMap,
								};
							}

							// Add new placeholder at the beginning
							return {
								...current,
								requests: [placeholder, ...current.requests].slice(0, limit),
								detailsMap: currentDetailsMap,
							};
						} else {
							// Update details map with summary
							const map = new Map(currentDetailsMap);
							map.set(evt.payload.id, evt.payload);

							// Update the request if it exists
							const requestIndex = current.requests.findIndex(
								(r) => r.id === evt.payload.id,
							);
							if (requestIndex >= 0) {
								const newRequests = [...current.requests];
								// Update meta to remove pending status
								if (newRequests[requestIndex].meta) {
									newRequests[requestIndex] = {
										...newRequests[requestIndex],
										meta: {
											...newRequests[requestIndex].meta,
											pending: false,
											success: evt.payload.success,
										},
									};
								}
								return { ...current, requests: newRequests, detailsMap: map };
							}

							return { ...current, detailsMap: map };
						}
					},
				);
			});

			es.addEventListener("error", (error) => {
				console.error("SSE connection error:", error);

				if (es) {
					es.close();
					es = null;
				}

				// Calculate exponential backoff delay (max 30 seconds)
				const delay = Math.min(1000 * 2 ** retries, 30000);
				retries++;

				console.log(`Reconnecting in ${delay}ms (attempt ${retries})`);
				reconnectTimeout = setTimeout(connect, delay);
			});
		};

		// Initial connection
		connect();

		// Cleanup function
		return () => {
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
			}
			if (es) {
				es.close();
			}
		};
	}, [limit, queryClient]);
}
