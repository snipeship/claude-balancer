import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { REFRESH_INTERVALS } from "../constants";
import { queryKeys } from "../lib/query-keys";

export const useAccounts = () => {
	return useQuery({
		queryKey: queryKeys.accounts(),
		queryFn: () => api.getAccounts(),
		refetchInterval: REFRESH_INTERVALS.fast, // Refresh every 10 seconds for rate limit updates
	});
};

export const useAgents = () => {
	return useQuery({
		queryKey: queryKeys.agents(),
		queryFn: () => api.getAgents(),
		refetchInterval: REFRESH_INTERVALS.slow, // Poll every 60 seconds for new agents
		refetchIntervalInBackground: true, // Continue polling when tab is not focused
	});
};

export const useStats = (refetchInterval?: number) => {
	return useQuery({
		queryKey: queryKeys.stats(),
		queryFn: () => api.getStats(),
		refetchInterval: refetchInterval ?? REFRESH_INTERVALS.fast,
	});
};

export const useAnalytics = (
	timeRange: string,
	filters: {
		accounts?: string[];
		models?: string[];
		status?: "all" | "success" | "error";
	},
	viewMode: "normal" | "cumulative",
	modelBreakdown?: boolean,
) => {
	return useQuery({
		queryKey: queryKeys.analytics(timeRange, filters, viewMode, modelBreakdown),
		queryFn: () =>
			api.getAnalytics(timeRange, filters, viewMode, modelBreakdown),
	});
};

export const useRequests = (limit: number, refetchInterval?: number) => {
	return useQuery({
		queryKey: queryKeys.requests(limit),
		queryFn: async () => {
			const [requestsDetail, requestsSummary] = await Promise.all([
				api.getRequestsDetail(limit),
				api.getRequestsSummary(limit),
			]);
			return { requests: requestsDetail, detailsMap: requestsSummary };
		},
		refetchInterval: refetchInterval ?? REFRESH_INTERVALS.fast,
	});
};

export const useRequestDetails = (id: string) => {
	return useQuery({
		queryKey: queryKeys.requestDetails(id),
		queryFn: () =>
			api
				.getRequestsDetail(1)
				.then((requests) => requests.find((r) => r.id === id)),
		enabled: !!id,
	});
};

export const useLogHistory = () => {
	return useQuery({
		queryKey: queryKeys.logHistory(),
		queryFn: () => api.getLogHistory(),
	});
};

// Mutations
export const useRemoveAccount = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			name,
			confirmInput,
		}: {
			name: string;
			confirmInput: string;
		}) => api.removeAccount(name, confirmInput),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
		},
	});
};

export const useRenameAccount = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			accountId,
			newName,
		}: {
			accountId: string;
			newName: string;
		}) => api.renameAccount(accountId, newName),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.accounts() });
		},
	});
};

export const useResetStats = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => api.resetStats(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.stats() });
		},
	});
};

export const useUpdateAgentPreference = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ agentId, model }: { agentId: string; model: string }) =>
			api.updateAgentPreference(agentId, model),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
		},
	});
};

export const useDefaultAgentModel = () => {
	return useQuery({
		queryKey: queryKeys.defaultAgentModel(),
		queryFn: () => api.getDefaultAgentModel(),
		refetchInterval: REFRESH_INTERVALS.slow, // Poll for config changes
		refetchIntervalInBackground: true, // Continue polling when tab is not focused
	});
};

export const useSetDefaultAgentModel = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (model: string) => api.setDefaultAgentModel(model),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.defaultAgentModel(),
			});
			queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
		},
	});
};

export const useBulkUpdateAgentPreferences = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (model: string) => api.setBulkAgentPreferences(model),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.agents() });
		},
	});
};

// Note: Clear logs functionality appears to be removed from the API
