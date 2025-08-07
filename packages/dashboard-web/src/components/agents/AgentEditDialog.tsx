import type {
	Agent,
	AgentTool,
	AgentUpdatePayload,
	AllowedModel,
} from "@ccflare/types";
import { ALL_TOOLS } from "@ccflare/types";
import { Cpu, Edit3, FileText, Palette, Save, Shield, X } from "lucide-react";
import { useMemo, useState } from "react";
import { TOOL_PRESETS } from "../../constants";
import { useUpdateAgent } from "../../hooks/queries";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

interface AgentEditDialogProps {
	agent: Agent;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type ToolPresetMode = keyof typeof TOOL_PRESETS;

// Helper function to get all combinations of array elements
function getCombinations<T>(arr: T[], size: number): T[][] {
	if (size === 0) return [[]];
	if (size > arr.length) return [];

	const result: T[][] = [];

	function combine(start: number, combo: T[]) {
		if (combo.length === size) {
			result.push([...combo]);
			return;
		}

		for (let i = start; i < arr.length; i++) {
			combo.push(arr[i]);
			combine(i + 1, combo);
			combo.pop();
		}
	}

	combine(0, []);
	return result;
}

const COLORS = [
	{ name: "gray", class: "bg-gray-500" },
	{ name: "blue", class: "bg-blue-500" },
	{ name: "green", class: "bg-green-500" },
	{ name: "yellow", class: "bg-yellow-500" },
	{ name: "orange", class: "bg-orange-500" },
	{ name: "red", class: "bg-red-500" },
	{ name: "purple", class: "bg-purple-500" },
	{ name: "pink", class: "bg-pink-500" },
	{ name: "indigo", class: "bg-indigo-500" },
	{ name: "cyan", class: "bg-cyan-500" },
];

const ALLOWED_MODELS: AllowedModel[] = [
	"claude-opus-4-20250514",
	"claude-sonnet-4-20250514",
];

const TOOL_MODE_INFO = {
	all: {
		label: "All Tools",
		description: "Full access to all available tools",
		icon: "🚀",
	},
	edit: {
		label: "Edit Mode",
		description: "File modification tools only",
		icon: "✏️",
	},
	"read-only": {
		label: "Read Only",
		description: "File reading and search tools",
		icon: "👁️",
	},
	execution: {
		label: "Execution",
		description: "Command execution tools only",
		icon: "⚡",
	},
};

export function AgentEditDialog({
	agent,
	open,
	onOpenChange,
}: AgentEditDialogProps) {
	const updateAgent = useUpdateAgent();

	const [description, setDescription] = useState(
		agent.description.replace(/\\n/g, "\n"),
	);
	const [model, setModel] = useState<AllowedModel>(agent.model);
	const [color, setColor] = useState(agent.color);
	const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);

	// Initialize selected modes based on current tools
	const [selectedModes, setSelectedModes] = useState<Set<ToolPresetMode>>(
		() => {
			if (!agent.tools || agent.tools.length === 0) {
				return new Set(["all"]);
			}

			const toolsSet = new Set(agent.tools);
			const matchingModes = new Set<ToolPresetMode>();

			// First, try to find exact matches with single presets
			for (const [mode, presetTools] of Object.entries(TOOL_PRESETS)) {
				if (mode === "all") continue;
				const presetSet = new Set(presetTools);
				if (
					toolsSet.size === presetSet.size &&
					[...toolsSet].every((tool) => presetSet.has(tool))
				) {
					matchingModes.add(mode as ToolPresetMode);
				}
			}

			// If we found exact single preset matches, return them
			if (matchingModes.size > 0) {
				return matchingModes;
			}

			// Otherwise, find the combination of presets that exactly matches our tools
			const presetModes = Object.keys(TOOL_PRESETS).filter(
				(m) => m !== "all",
			) as ToolPresetMode[];

			// Try all combinations of presets to find exact matches
			for (let i = 1; i <= presetModes.length; i++) {
				const combinations = getCombinations(presetModes, i);
				for (const combo of combinations) {
					const comboTools = new Set<AgentTool>();
					for (const mode of combo) {
						TOOL_PRESETS[mode].forEach((tool) => comboTools.add(tool));
					}
					// Check if this combination exactly matches our tools
					if (
						comboTools.size === toolsSet.size &&
						[...toolsSet].every((tool) => comboTools.has(tool))
					) {
						return new Set(combo);
					}
				}
			}

			// If no exact combination found, return empty set (will trigger custom mode)
			return new Set<ToolPresetMode>();
		},
	);

	const [customTools, setCustomTools] = useState<AgentTool[]>(
		agent.tools || [],
	);

	const [isCustomMode, setIsCustomMode] = useState(() => {
		// Start in custom mode if:
		// 1. No modes are selected (tools don't match any preset combination)
		// 2. Or if we have the "all" preset selected and there are tools
		if (selectedModes.size === 0) {
			return true;
		}
		if (selectedModes.has("all") && agent.tools && agent.tools.length > 0) {
			return true;
		}
		return false;
	});

	// Compute effective tools based on selected modes
	const effectiveTools = useMemo(() => {
		if (isCustomMode) {
			return customTools;
		}

		if (selectedModes.has("all")) {
			return [];
		}

		const toolSet = new Set<AgentTool>();
		for (const mode of selectedModes) {
			if (mode !== "all") {
				TOOL_PRESETS[mode].forEach((tool) => toolSet.add(tool));
			}
		}
		return Array.from(toolSet);
	}, [selectedModes, customTools, isCustomMode]);

	const handleModeToggle = (mode: ToolPresetMode) => {
		const newModes = new Set(selectedModes);

		if (mode === "all") {
			// If selecting "all", clear other selections
			if (newModes.has("all")) {
				newModes.delete("all");
			} else {
				newModes.clear();
				newModes.add("all");
			}
		} else {
			// Toggle the mode
			if (newModes.has(mode)) {
				newModes.delete(mode);
			} else {
				newModes.add(mode);
				// Remove "all" if selecting specific modes
				newModes.delete("all");
			}
		}

		setSelectedModes(newModes);

		// Calculate the tools from the new preset selection
		const newToolSet = new Set<AgentTool>();
		for (const m of newModes) {
			if (m !== "all") {
				TOOL_PRESETS[m].forEach((tool) => newToolSet.add(tool));
			}
		}

		// Check if custom tools match the new preset selection
		const customToolSet = new Set(customTools);
		const hasExtraTools = [...customToolSet].some(
			(tool) => !newToolSet.has(tool),
		);
		const _missingTools = [...newToolSet].some(
			(tool) => !customToolSet.has(tool),
		);

		// Only stay in custom mode if we have extra tools that aren't in the presets
		if (isCustomMode && hasExtraTools && newModes.size > 0) {
			// Stay in custom mode but update the selection
			setIsCustomMode(true);
		} else {
			// Switch to preset mode
			setIsCustomMode(false);
			setCustomTools(Array.from(newToolSet));
		}
	};

	const handleCustomModeToggle = () => {
		if (!isCustomMode) {
			// Entering custom mode - keep current tools
			setCustomTools(effectiveTools);
			setIsCustomMode(true);
		} else {
			// Exiting custom mode - try to find matching presets
			const toolSet = new Set(customTools);

			// Try to find matching preset combinations
			const presetModes = Object.keys(TOOL_PRESETS).filter(
				(m) => m !== "all",
			) as ToolPresetMode[];

			for (let i = 1; i <= presetModes.length; i++) {
				const combinations = getCombinations(presetModes, i);
				for (const combo of combinations) {
					const comboTools = new Set<AgentTool>();
					for (const mode of combo) {
						TOOL_PRESETS[mode].forEach((tool) => comboTools.add(tool));
					}
					// Check if this combination exactly matches our tools
					if (
						comboTools.size === toolSet.size &&
						[...toolSet].every((tool) => comboTools.has(tool))
					) {
						// Found a matching preset combination
						setSelectedModes(new Set(combo));
						setIsCustomMode(false);
						return;
					}
				}
			}

			// If no exact match found, just exit custom mode with empty selection
			setSelectedModes(new Set());
			setIsCustomMode(false);
		}
	};

	const handleSave = async () => {
		try {
			const tools = effectiveTools;

			// Determine mode for API - only send if it's a single exact match
			let mode: string | undefined;
			if (!isCustomMode && selectedModes.size === 1) {
				const [selectedMode] = selectedModes;
				if (selectedMode === "all" && tools.length === 0) {
					mode = "all";
				} else if (selectedMode !== "all") {
					const presetTools = TOOL_PRESETS[selectedMode];
					if (
						tools.length === presetTools.length &&
						tools.every((t) => presetTools.includes(t))
					) {
						mode = selectedMode;
					}
				}
			}

			await updateAgent.mutateAsync({
				id: agent.id,
				payload: {
					description: description.replace(/\n/g, "\\n"),
					model,
					color,
					systemPrompt,
					mode: mode as AgentUpdatePayload["mode"],
					tools: mode ? undefined : tools,
				},
			});

			onOpenChange(false);
		} catch (error) {
			console.error("Failed to update agent:", error);
		}
	};

	const handleToolToggle = (tool: AgentTool) => {
		const newTools = customTools.includes(tool)
			? customTools.filter((t) => t !== tool)
			: [...customTools, tool];

		setCustomTools(newTools);

		// Check if the new tool selection matches any preset combination
		const newToolSet = new Set(newTools);

		// Try to find matching preset combinations
		const presetModes = Object.keys(TOOL_PRESETS).filter(
			(m) => m !== "all",
		) as ToolPresetMode[];

		for (let i = 1; i <= presetModes.length; i++) {
			const combinations = getCombinations(presetModes, i);
			for (const combo of combinations) {
				const comboTools = new Set<AgentTool>();
				for (const mode of combo) {
					TOOL_PRESETS[mode].forEach((tool) => comboTools.add(tool));
				}
				// Check if this combination exactly matches our tools
				if (
					comboTools.size === newToolSet.size &&
					[...newToolSet].every((tool) => comboTools.has(tool))
				) {
					// Found a matching preset combination
					setSelectedModes(new Set(combo));
					setIsCustomMode(false);
					return;
				}
			}
		}

		// No matching preset combination found, stay in custom mode
		setIsCustomMode(true);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader className="space-y-4 pb-6 border-b">
					<DialogTitle className="flex items-center gap-3 text-xl">
						<div className="p-2 bg-primary/10 rounded-lg">
							<Edit3 className="h-5 w-5 text-primary" />
						</div>
						<span>Edit Agent Configuration</span>
					</DialogTitle>
					<DialogDescription className="flex items-center gap-2">
						<Badge variant="secondary" className="gap-1.5">
							{agent.name}
						</Badge>
						<span className="text-muted-foreground">
							Customize how this agent behaves and what it can access
						</span>
					</DialogDescription>
				</DialogHeader>

				<Tabs defaultValue="general" className="flex-1 overflow-hidden">
					<TabsList className="grid w-full grid-cols-4">
						<TabsTrigger value="general" className="gap-2">
							<FileText className="h-4 w-4" />
							General
						</TabsTrigger>
						<TabsTrigger value="description" className="gap-2">
							<Edit3 className="h-4 w-4" />
							Description
						</TabsTrigger>
						<TabsTrigger value="tools" className="gap-2">
							<Shield className="h-4 w-4" />
							Tools
						</TabsTrigger>
						<TabsTrigger value="prompt" className="gap-2">
							<Cpu className="h-4 w-4" />
							Prompt
						</TabsTrigger>
					</TabsList>

					<div className="overflow-y-auto flex-1 px-1">
						<TabsContent value="general" className="mt-6 space-y-6">
							{/* Model */}
							<div className="space-y-3">
								<Label className="text-base font-medium">Language Model</Label>
								<Select
									value={model}
									onValueChange={(value) => setModel(value as AllowedModel)}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ALLOWED_MODELS.map((m) => (
											<SelectItem key={m} value={m}>
												<div className="flex items-center gap-2">
													<Cpu className="h-4 w-4" />
													{m.includes("opus")
														? "Claude Opus 4"
														: "Claude Sonnet 4"}
													{m.includes("opus") && (
														<Badge variant="secondary" className="ml-2 text-xs">
															Advanced
														</Badge>
													)}
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Color */}
							<div className="space-y-3">
								<Label className="text-base font-medium flex items-center gap-2">
									<Palette className="h-4 w-4" />
									Theme Color
								</Label>
								<div className="grid grid-cols-5 gap-3">
									{COLORS.map(({ name, class: colorClass }) => (
										<button
											key={name}
											type="button"
											onClick={() => setColor(name)}
											className={cn(
												"relative h-12 rounded-lg border-2 transition-all",
												"hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
												color === name
													? "border-primary shadow-lg"
													: "border-transparent",
											)}
										>
											<div
												className={cn(
													"h-full w-full rounded-md",
													colorClass,
													"opacity-90",
												)}
											/>
											{color === name && (
												<div className="absolute inset-0 flex items-center justify-center">
													<div className="h-3 w-3 rounded-full bg-white shadow-sm" />
												</div>
											)}
										</button>
									))}
								</div>
							</div>
						</TabsContent>

						<TabsContent value="description" className="mt-6 space-y-4">
							<div className="space-y-3">
								<Label htmlFor="description" className="text-base font-medium">
									Agent Description
								</Label>
								<textarea
									id="description"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									rows={12}
									className="flex min-h-[300px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono"
									placeholder="Describe what this agent does and when to use it..."
								/>
								<p className="text-xs text-muted-foreground">
									This description helps users understand when to use this agent
								</p>
							</div>
						</TabsContent>

						<TabsContent value="tools" className="mt-6 space-y-6">
							<div className="space-y-6">
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<Label className="text-base font-medium">
											Tool Access Presets
										</Label>
										<Badge variant="outline" className="gap-1.5">
											{effectiveTools.length === 0
												? "All tools"
												: `${effectiveTools.length} tools selected`}
										</Badge>
									</div>

									<p className="text-sm text-muted-foreground">
										Select one or more presets to combine their tool sets, or
										use custom selection for fine-grained control.
									</p>

									<div className="grid gap-3">
										{(
											Object.keys(TOOL_MODE_INFO) as Array<
												keyof typeof TOOL_MODE_INFO
											>
										).map((mode) => {
											const info = TOOL_MODE_INFO[mode];
											const isSelected = selectedModes.has(mode);
											const toolCount = TOOL_PRESETS[mode]?.length || 0;

											return (
												<button
													key={mode}
													type="button"
													onClick={() => handleModeToggle(mode)}
													disabled={isCustomMode}
													className={cn(
														"relative flex items-start gap-4 rounded-lg border p-4 text-left transition-all",
														"hover:bg-accent/50",
														isSelected && !isCustomMode
															? "border-primary bg-primary/5"
															: "border-border",
														isCustomMode && "opacity-50 cursor-not-allowed",
													)}
												>
													<input
														type="checkbox"
														checked={isSelected && !isCustomMode}
														onChange={() => {}}
														className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
														disabled={isCustomMode}
													/>
													<div className="text-2xl">{info.icon}</div>
													<div className="flex-1 space-y-1">
														<div className="font-medium">{info.label}</div>
														<div className="text-sm text-muted-foreground">
															{info.description}
														</div>
														<Badge variant="secondary" className="mt-2">
															{mode === "all"
																? "All tools"
																: `${toolCount} tools`}
														</Badge>
													</div>
												</button>
											);
										})}
									</div>
								</div>

								{/* Custom Mode Toggle */}
								<div className="border-t pt-6">
									<button
										type="button"
										onClick={handleCustomModeToggle}
										className={cn(
											"relative flex items-start gap-4 rounded-lg border p-4 text-left transition-all w-full",
											"hover:bg-accent/50",
											isCustomMode
												? "border-primary bg-primary/5"
												: "border-border",
										)}
									>
										<input
											type="checkbox"
											checked={isCustomMode}
											onChange={() => {}}
											className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
										/>
										<div className="text-2xl">⚙️</div>
										<div className="flex-1 space-y-1">
											<div className="font-medium">Custom Selection</div>
											<div className="text-sm text-muted-foreground">
												Manually select specific tools
											</div>
										</div>
									</button>

									{/* Custom Tools Selection */}
									{isCustomMode && (
										<div className="mt-4 space-y-3">
											<div className="flex items-center justify-between">
												<Label className="text-sm font-medium">
													Select Tools ({customTools.length} selected)
												</Label>
												<div className="flex gap-2">
													<Button
														type="button"
														variant="ghost"
														size="sm"
														onClick={() => setCustomTools(ALL_TOOLS)}
													>
														Select All
													</Button>
													<Button
														type="button"
														variant="ghost"
														size="sm"
														onClick={() => setCustomTools([])}
													>
														Clear
													</Button>
												</div>
											</div>
											<div className="grid grid-cols-2 gap-2 rounded-lg border p-4 max-h-64 overflow-y-auto">
												{ALL_TOOLS.map((tool) => (
													<label
														key={tool}
														className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer"
													>
														<input
															type="checkbox"
															checked={customTools.includes(tool)}
															onChange={() => handleToolToggle(tool)}
															className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
														/>
														<span className="text-sm">{tool}</span>
													</label>
												))}
											</div>
										</div>
									)}
								</div>
							</div>
						</TabsContent>

						<TabsContent value="prompt" className="mt-6 space-y-4">
							<div className="space-y-3">
								<Label htmlFor="systemPrompt" className="text-base font-medium">
									System Prompt
								</Label>
								<textarea
									id="systemPrompt"
									value={systemPrompt}
									onChange={(e) => setSystemPrompt(e.target.value)}
									rows={12}
									className="flex min-h-[300px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none font-mono"
									placeholder="Enter the system prompt that defines this agent's behavior..."
								/>
								<p className="text-xs text-muted-foreground">
									This prompt will be used to initialize the agent's behavior
									and capabilities
								</p>
							</div>
						</TabsContent>
					</div>
				</Tabs>

				<DialogFooter className="border-t pt-6">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={updateAgent.isPending}
					>
						<X className="h-4 w-4 mr-2" />
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={updateAgent.isPending}>
						<Save className="h-4 w-4 mr-2" />
						{updateAgent.isPending ? "Saving..." : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
