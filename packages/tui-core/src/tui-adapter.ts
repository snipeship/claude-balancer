import type { PromptAdapter } from "@ccflare/cli-commands";

/**
 * Special error thrown when TUI needs to collect authorization code
 */
export class AuthorizationCodeRequiredError extends Error {
	constructor(public authUrl: string) {
		super("Authorization code required");
		this.name = "AuthorizationCodeRequiredError";
	}
}

/**
 * TUI prompt adapter that throws when authorization code is needed
 * This allows the TUI to handle auth code collection asynchronously
 */
export class TuiPromptAdapter implements PromptAdapter {
	private authUrl?: string;

	setAuthUrl(url: string) {
		this.authUrl = url;
	}

	async select<T extends string | number>(
		_question: string,
		options: Array<{ label: string; value: T }>,
	): Promise<T> {
		// The TUI should have already collected mode and tier
		// This shouldn't be called, but return first option as fallback
		return options[0].value;
	}

	async input(question: string, _mask?: boolean): Promise<string> {
		// When asked for authorization code, throw special error
		if (question.includes("authorization code") && this.authUrl) {
			throw new AuthorizationCodeRequiredError(this.authUrl);
		}
		throw new Error("Unexpected input prompt in TUI context");
	}

	async confirm(_question: string): Promise<boolean> {
		// The TUI handles confirmations through its own UI
		return true;
	}
}

export const tuiPromptAdapter = new TuiPromptAdapter();
