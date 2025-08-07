import { CLAUDE_MODEL_IDS, DEFAULT_AGENT_MODEL } from "@ccflare/core";
import {
	AlertCircle,
	Bot,
	Folder,
	FolderOpen,
	Globe,
	Info,
	Package,
	RefreshCw,
	Settings,
} from "lucide-react";
import { useState } from "react";
import {
	useAgents,
	useBulkUpdateAgentPreferences,
	useDefaultAgentModel,
	useSetDefaultAgentModel,
	useUpdateAgentPreference,
} from "../hooks/queries";
import { AgentCard, WorkspaceCard } from "./agents";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export function AgentsTab() {
	const { data: response, isLoading, error, refetch } = useAgents();
	const updatePreference = useUpdateAgentPreference();
	const { data: defaultModel, isLoading: isLoadingDefaultModel } =
		useDefaultAgentModel();
	const setDefaultModel = useSetDefaultAgentModel();
	const bulkUpdatePreferences = useBulkUpdateAgentPreferences();
	const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(
		null,
	);
	const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
	const [bulkUpdateModel, setBulkUpdateModel] =
		useState<string>(DEFAULT_AGENT_MODEL);

	const handleModelChange = (agentId: string, model: string) => {
		updatePreference.mutate({ agentId, model });
	};

	const handleDefaultModelChange = (model: string) => {
		setDefaultModel.mutate(model);
	};

	const handleBulkUpdate = () => {
		bulkUpdatePreferences.mutate(bulkUpdateModel, {
			onSuccess: (_data) => {
				setBulkUpdateDialogOpen(false);
				// You could add a toast notification here
			},
		});
	};

	if (isLoading) {
		return (
			<div className="space-y-8">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{[...Array(6)].map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton elements
						<Card key={i}>
							<CardHeader>
								<Skeleton className="h-6 w-32" />
								<Skeleton className="h-4 w-full mt-2" />
								<Skeleton className="h-4 w-3/4" />
							</CardHeader>
							<CardContent>
								<Skeleton className="h-4 w-24" />
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-destructive">
						<AlertCircle className="h-5 w-5" />
						Error Loading Agents
					</CardTitle>
					<CardDescription>
						{error instanceof Error ? error.message : "Failed to load agents"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={() => refetch()} variant="outline" size="sm">
						<RefreshCw className="mr-2 h-4 w-4" />
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (!response || response.agents.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Bot className="h-5 w-5" />
						No Agents Found
					</CardTitle>
					<CardDescription>
						No agent definition files found in ~/.claude/agents/ or workspace
						directories
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<h4 className="font-medium mb-2">Global Agents</h4>
						<p className="text-sm text-muted-foreground">
							To add global agents, create markdown files in the
							~/.claude/agents/ directory.
						</p>
					</div>
					<Separator />
					<div>
						<h4 className="font-medium mb-2">Workspace Agents</h4>
						<p className="text-sm text-muted-foreground">
							To add workspace-specific agents, create markdown files in your
							project's .claude/agents/ directory. They should be able to
							discover local project agents after you send a message from within
							that directory.
						</p>
					</div>
					<Separator />
					<div>
						<h4 className="font-medium mb-2">Agent Format</h4>
						<pre className="mt-2 p-4 bg-muted rounded-lg text-xs overflow-x-auto">
							{`---
name: My Agent
description: Description of what this agent does
color: blue
model: ${DEFAULT_AGENT_MODEL}
---

Your system prompt content here...`}
						</pre>
					</div>
				</CardContent>
			</Card>
		);
	}

	const { globalAgents, workspaceAgents, workspaces } = response;
	const filteredWorkspaceAgents = selectedWorkspace
		? workspaceAgents.filter((agent) => agent.workspace === selectedWorkspace)
		: workspaceAgents;

	// Add agent counts to workspaces
	const workspacesWithCounts = workspaces.map((workspace) => ({
		...workspace,
		agentCount: workspaceAgents.filter((a) => a.workspace === workspace.path)
			.length,
	}));

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-2xl font-bold flex items-center gap-3">
							<div className="p-2 bg-primary/10 rounded-lg">
								<Bot className="h-6 w-6 text-primary" />
							</div>
							AI Agents
						</h2>
						<p className="text-muted-foreground mt-1">
							Manage your AI agents and their model preferences
						</p>
					</div>
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-2">
							<Badge variant="secondary" className="gap-1.5">
								<Globe className="h-3.5 w-3.5" />
								{globalAgents.length} Global
							</Badge>
							<Badge variant="secondary" className="gap-1.5">
								<Folder className="h-3.5 w-3.5" />
								{workspaceAgents.length} Workspace
							</Badge>
						</div>
					</div>
				</div>

				{/* Default Model Settings */}
				<Card>
					<CardHeader>
						<CardTitle className="text-base flex items-center gap-2">
							<Settings className="h-4 w-4" />
							Default Agent Model
						</CardTitle>
						<CardDescription>
							Set the default model for all agents. Individual agent preferences
							will override this setting.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="flex items-center gap-4">
								<div className="flex-1">
									<Select
										value={defaultModel || DEFAULT_AGENT_MODEL}
										onValueChange={handleDefaultModelChange}
										disabled={
											isLoadingDefaultModel || setDefaultModel.isPending
										}
									>
										<SelectTrigger className="w-full max-w-xs">
											<SelectValue placeholder="Select a model" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={CLAUDE_MODEL_IDS.OPUS_4}>
												Claude Opus 4
											</SelectItem>
											<SelectItem value={CLAUDE_MODEL_IDS.SONNET_4}>
												Claude Sonnet 4
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								{setDefaultModel.isPending && (
									<span className="text-sm text-muted-foreground">
										Updating...
									</span>
								)}
							</div>

							<Separator />

							<div className="space-y-2">
								<p className="text-sm font-medium">Force Update All Agents</p>
								<p className="text-sm text-muted-foreground">
									Override all individual agent preferences with a specific
									model.
								</p>
								<Dialog
									open={bulkUpdateDialogOpen}
									onOpenChange={setBulkUpdateDialogOpen}
								>
									<DialogTrigger asChild>
										<Button variant="outline" size="sm">
											Force Update All
										</Button>
									</DialogTrigger>
									<DialogContent>
										<DialogHeader>
											<DialogTitle>Update All Agent Models</DialogTitle>
											<DialogDescription>
												This will override all individual agent preferences and
												set them to the selected model. This action cannot be
												undone.
											</DialogDescription>
										</DialogHeader>
										<div className="py-4">
											<Select
												value={bulkUpdateModel}
												onValueChange={setBulkUpdateModel}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={CLAUDE_MODEL_IDS.OPUS_4}>
														Claude Opus 4
													</SelectItem>
													<SelectItem value={CLAUDE_MODEL_IDS.SONNET_4}>
														Claude Sonnet 4
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<DialogFooter>
											<Button
												variant="outline"
												onClick={() => setBulkUpdateDialogOpen(false)}
											>
												Cancel
											</Button>
											<Button
												onClick={handleBulkUpdate}
												disabled={bulkUpdatePreferences.isPending}
											>
												{bulkUpdatePreferences.isPending
													? "Updating..."
													: `Update ${response?.agents.length || 0} Agents`}
											</Button>
										</DialogFooter>
									</DialogContent>
								</Dialog>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Workspaces Section */}
				{workspacesWithCounts.length > 0 && (
					<Card className="border-dashed">
						<CardHeader>
							<CardTitle className="text-base flex items-center gap-2">
								<FolderOpen className="h-4 w-4" />
								Active Workspaces
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{workspacesWithCounts.map((workspace) => (
									<button
										type="button"
										key={workspace.path}
										onClick={() =>
											setSelectedWorkspace(
												selectedWorkspace === workspace.path
													? null
													: workspace.path,
											)
										}
										className="text-left w-full"
									>
										<WorkspaceCard
											workspace={workspace}
											isActive={selectedWorkspace === workspace.path}
										/>
									</button>
								))}
							</div>
						</CardContent>
					</Card>
				)}
			</div>

			{/* Agents Tabs */}
			<Tabs defaultValue="all" className="space-y-4">
				<TabsList className="grid w-full max-w-md grid-cols-3">
					<TabsTrigger value="all" className="gap-1.5">
						<Package className="h-4 w-4" />
						All Agents
					</TabsTrigger>
					<TabsTrigger value="global" className="gap-1.5">
						<Globe className="h-4 w-4" />
						Global
					</TabsTrigger>
					<TabsTrigger value="workspace" className="gap-1.5">
						<Folder className="h-4 w-4" />
						Workspace
					</TabsTrigger>
				</TabsList>

				<TabsContent value="all" className="space-y-6">
					{globalAgents.length > 0 && (
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<h3 className="text-lg font-semibold">Global Agents</h3>
								<Badge variant="outline">{globalAgents.length}</Badge>
							</div>
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{globalAgents.map((agent) => (
									<AgentCard
										key={agent.id}
										agent={agent}
										onModelChange={handleModelChange}
										isUpdating={updatePreference.isPending}
									/>
								))}
							</div>
						</div>
					)}

					{workspaceAgents.length > 0 && (
						<div className="space-y-4">
							<div className="flex items-center gap-2">
								<h3 className="text-lg font-semibold">Workspace Agents</h3>
								<Badge variant="outline">
									{filteredWorkspaceAgents.length}
								</Badge>
								{selectedWorkspace && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setSelectedWorkspace(null)}
									>
										Clear filter
									</Button>
								)}
							</div>
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{filteredWorkspaceAgents.map((agent) => (
									<AgentCard
										key={agent.id}
										agent={agent}
										onModelChange={handleModelChange}
										isUpdating={updatePreference.isPending}
									/>
								))}
							</div>
						</div>
					)}
				</TabsContent>

				<TabsContent value="global" className="space-y-4">
					{globalAgents.length === 0 ? (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Info className="h-5 w-5" />
									No Global Agents
								</CardTitle>
								<CardDescription>
									Create agent files in ~/.claude/agents/ to add global agents
								</CardDescription>
							</CardHeader>
						</Card>
					) : (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{globalAgents.map((agent) => (
								<AgentCard
									key={agent.id}
									agent={agent}
									onModelChange={handleModelChange}
									isUpdating={updatePreference.isPending}
								/>
							))}
						</div>
					)}
				</TabsContent>

				<TabsContent value="workspace" className="space-y-4">
					{workspaceAgents.length === 0 ? (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<Info className="h-5 w-5" />
									No Workspace Agents
								</CardTitle>
								<CardDescription>
									Workspace agents are automatically discovered from your
									project directories. They should be able to discover local
									project agents after you send a message from within that
									directory.
								</CardDescription>
							</CardHeader>
						</Card>
					) : (
						<>
							{selectedWorkspace && (
								<div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
									<Folder className="h-4 w-4" />
									<span className="text-sm">
										Showing agents from:{" "}
										<strong>{selectedWorkspace.split("/").pop()}</strong>
									</span>
									<Button
										variant="ghost"
										size="sm"
										className="ml-auto"
										onClick={() => setSelectedWorkspace(null)}
									>
										Clear filter
									</Button>
								</div>
							)}
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{filteredWorkspaceAgents.map((agent) => (
									<AgentCard
										key={agent.id}
										agent={agent}
										onModelChange={handleModelChange}
										isUpdating={updatePreference.isPending}
									/>
								))}
							</div>
						</>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
