import { EventEmitter } from "node:events";

export type RequestStartEvt = {
	type: "start";
	id: string;
	timestamp: number;
	method: string;
	path: string;
	accountId: string | null;
	statusCode: number;
	agentUsed: string | null;
};

export type RequestSummaryEvt = {
	type: "summary";
	payload: import("@ccflare/types").RequestResponse;
};

export type RequestEvt = RequestStartEvt | RequestSummaryEvt;

class RequestEventBus extends EventEmitter {}
export const requestEvents = new RequestEventBus();
