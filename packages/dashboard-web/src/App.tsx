import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "./components/Dashboard";
import { LoginPage } from "./components/LoginPage";
import { QUERY_CONFIG, REFRESH_INTERVALS } from "./constants";
import { AuthProvider, useAuth } from "./contexts/auth-context";
import { ThemeProvider } from "./contexts/theme-context";
import "./index.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchInterval: REFRESH_INTERVALS.default, // Refetch every 30 seconds
			staleTime: QUERY_CONFIG.staleTime, // Consider data stale after 10 seconds
		},
	},
});

function AppContent() {
	const { isAuthenticated, login } = useAuth();

	if (!isAuthenticated) {
		return <LoginPage onLogin={login} />;
	}

	return <Dashboard />;
}

export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ThemeProvider>
				<AuthProvider>
					<AppContent />
				</AuthProvider>
			</ThemeProvider>
		</QueryClientProvider>
	);
}
