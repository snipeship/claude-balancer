import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

interface AuthContextType {
	isAuthenticated: boolean;
	login: (username: string, password: string) => Promise<boolean>;
	logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Check if already authenticated on mount
	useEffect(() => {
		const checkAuth = async () => {
			try {
				const response = await fetch("/api/auth/check", {
					credentials: "include",
				});
				setIsAuthenticated(response.ok);
			} catch {
				setIsAuthenticated(false);
			} finally {
				setIsLoading(false);
			}
		};

		checkAuth();
	}, []);

	const login = async (
		username: string,
		password: string,
	): Promise<boolean> => {
		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ username, password }),
				credentials: "include",
			});

			if (response.ok) {
				setIsAuthenticated(true);
				return true;
			}
			return false;
		} catch {
			return false;
		}
	};

	const logout = async () => {
		try {
			await fetch("/api/auth/logout", {
				method: "POST",
				credentials: "include",
			});
		} catch {
			// Ignore errors
		}
		setIsAuthenticated(false);
	};

	if (isLoading) {
		return <div className="min-h-screen bg-background" />;
	}

	return (
		<AuthContext.Provider value={{ isAuthenticated, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
