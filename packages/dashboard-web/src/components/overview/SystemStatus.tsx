import { CheckCircle, XCircle } from "lucide-react";
import { Badge } from "../ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";

interface SystemStatusProps {
	recentErrors?: string[];
}

export function SystemStatus({ recentErrors }: SystemStatusProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>System Status</CardTitle>
				<CardDescription>
					Current operational status and recent events
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					<div className="flex items-center justify-between p-4 rounded-lg bg-success/10">
						<div className="flex items-center gap-3">
							<CheckCircle className="h-5 w-5 text-success" />
							<div>
								<p className="font-medium">All Systems Operational</p>
								<p className="text-sm text-muted-foreground">
									No issues detected
								</p>
							</div>
						</div>
						<Badge variant="default" className="bg-success">
							Healthy
						</Badge>
					</div>

					{recentErrors && recentErrors.length > 0 && (
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">
								Recent Errors
							</h4>
							{recentErrors.slice(0, 3).map((error, i) => (
								<div
									key={`error-${error.substring(0, 20)}-${i}`}
									className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10"
								>
									<XCircle className="h-4 w-4 text-destructive mt-0.5" />
									<p className="text-sm text-muted-foreground">{error}</p>
								</div>
							))}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
