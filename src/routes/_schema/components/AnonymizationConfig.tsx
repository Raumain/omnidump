import { ChevronDown, ChevronRight, Shield } from "lucide-react";
import { useState } from "react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	ANONYMIZATION_METHOD_LABELS,
	ANONYMIZATION_METHODS,
	type AnonymizationMethod,
	type AnonymizationRule,
} from "@/lib/anonymization-types";

type TableInfo = {
	tableName: string;
	columns: Array<{
		name: string;
		dataType: string;
		isNullable: boolean;
	}>;
};

interface AnonymizationConfigProps {
	tables: TableInfo[];
	rules: AnonymizationRule[];
	onRulesChange: (rules: AnonymizationRule[]) => void;
}

export function AnonymizationConfig({
	tables,
	rules,
	onRulesChange,
}: AnonymizationConfigProps) {
	const [expandedTables, setExpandedTables] = useState<Set<string>>(
		() => new Set(tables.map((t) => t.tableName)),
	);

	const toggleTable = (tableName: string) => {
		setExpandedTables((prev) => {
			const next = new Set(prev);
			if (next.has(tableName)) {
				next.delete(tableName);
			} else {
				next.add(tableName);
			}
			return next;
		});
	};

	const getColumnRule = (
		tableName: string,
		columnName: string,
	): AnonymizationRule | undefined => {
		return rules.find(
			(r) => r.tableName === tableName && r.columnName === columnName,
		);
	};

	const setColumnMethod = (
		tableName: string,
		columnName: string,
		method: AnonymizationMethod | null,
	) => {
		const existingRuleIndex = rules.findIndex(
			(r) => r.tableName === tableName && r.columnName === columnName,
		);

		if (method === null) {
			// Remove rule
			if (existingRuleIndex >= 0) {
				const newRules = [...rules];
				newRules.splice(existingRuleIndex, 1);
				onRulesChange(newRules);
			}
		} else {
			// Add or update rule
			if (existingRuleIndex >= 0) {
				const newRules = [...rules];
				newRules[existingRuleIndex] = {
					...newRules[existingRuleIndex],
					method,
				};
				onRulesChange(newRules);
			} else {
				onRulesChange([
					...rules,
					{
						profileId: 0, // Will be set when saving
						tableName,
						columnName,
						method,
					},
				]);
			}
		}
	};

	const tableRuleCounts = tables.map((table) => ({
		tableName: table.tableName,
		count: rules.filter((r) => r.tableName === table.tableName).length,
	}));

	const totalRules = rules.length;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="font-bold uppercase text-sm flex items-center gap-2">
					<Shield className="w-4 h-4" />
					Column Rules ({totalRules})
				</span>
				{totalRules > 0 && (
					<button
						type="button"
						onClick={() => onRulesChange([])}
						className="text-xs font-bold uppercase text-destructive hover:underline"
					>
						Clear All
					</button>
				)}
			</div>

			<div className="border-2 border-border bg-secondary max-h-80 overflow-y-auto">
				{tables.length === 0 ? (
					<p className="p-3 text-muted-foreground text-sm">No tables found</p>
				) : (
					tables.map((table) => {
						const isExpanded = expandedTables.has(table.tableName);
						const ruleCount =
							tableRuleCounts.find((t) => t.tableName === table.tableName)
								?.count ?? 0;

						return (
							<div
								key={table.tableName}
								className="border-b border-border last:border-b-0"
							>
								<button
									type="button"
									onClick={() => toggleTable(table.tableName)}
									className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 transition-colors"
								>
									{isExpanded ? (
										<ChevronDown className="w-4 h-4 shrink-0" />
									) : (
										<ChevronRight className="w-4 h-4 shrink-0" />
									)}
									<span className="font-mono text-sm font-bold flex-1 text-left">
										{table.tableName}
									</span>
									{ruleCount > 0 && (
										<span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 font-bold">
											{ruleCount}
										</span>
									)}
									<span className="text-xs text-muted-foreground">
										{table.columns.length} cols
									</span>
								</button>

								{isExpanded && (
									<div className="bg-card border-t border-border">
										{table.columns.map((column) => {
											const rule = getColumnRule(table.tableName, column.name);

											return (
												<div
													key={column.name}
													className="flex items-center gap-2 px-4 py-2 border-b border-border/50 last:border-b-0"
												>
													<div className="flex-1 min-w-0">
														<span className="font-mono text-sm">
															{column.name}
														</span>
														<span className="text-xs text-muted-foreground ml-2">
															{column.dataType}
														</span>
													</div>
													<Select
														value={rule?.method ?? "none"}
														onValueChange={(value) =>
															setColumnMethod(
																table.tableName,
																column.name,
																value === "none"
																	? null
																	: (value as AnonymizationMethod),
															)
														}
													>
														<SelectTrigger
															className={`w-44 rounded-none border-2 shadow-hardware text-xs font-bold uppercase h-8 ${
																rule
																	? "border-primary bg-primary/10"
																	: "border-border bg-card"
															}`}
														>
															<SelectValue placeholder="No anonymization" />
														</SelectTrigger>
														<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
															<SelectItem
																value="none"
																className="text-xs font-bold rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
															>
																No anonymization
															</SelectItem>
															{ANONYMIZATION_METHODS.map((method) => (
																<SelectItem
																	key={method}
																	value={method}
																	className="text-xs font-bold rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
																>
																	{ANONYMIZATION_METHOD_LABELS[method]}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})
				)}
			</div>

			{totalRules > 0 && (
				<p className="text-xs text-muted-foreground">
					{totalRules} column{totalRules !== 1 ? "s" : ""} will be anonymized
				</p>
			)}
		</div>
	);
}
