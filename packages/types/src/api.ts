export interface RequestMeta {
	id: string;
	method: string;
	path: string;
	timestamp: number;
	agentUsed?: string | null;
}
