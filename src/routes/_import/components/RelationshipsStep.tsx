import { ArrowRight, Link2, Plus, Trash2 } from "lucide-react";

import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	type CsvFileConfig,
	type ForeignKeyDef,
	generateId,
} from "#/lib/csv-import-types";

type RelationshipsStepProps = {
	csvFiles: CsvFileConfig[];
	relationships: ForeignKeyDef[];
	onUpdate: (relationships: ForeignKeyDef[]) => void;
};

export function RelationshipsStep({
	csvFiles,
	relationships,
	onUpdate,
}: RelationshipsStepProps) {
	const tableMap = new Map<string, Set<string>>();

	for (const file of csvFiles) {
		if (file.importMode === "simple") {
			const tableName = file.tableName.trim();
			if (tableName === "") {
				continue;
			}

			const columns =
				file.tableMode === "create"
					? file.columns.map((column) => column.name)
					: Object.values(file.mapping).filter(
							(column) => column.trim() !== "",
						);

			if (!tableMap.has(tableName)) {
				tableMap.set(tableName, new Set<string>());
			}

			const target = tableMap.get(tableName);
			if (target) {
				for (const column of columns) {
					target.add(column);
				}
			}

			continue;
		}

		for (const target of Object.values(file.advancedMapping)) {
			if (
				!target ||
				target.tableName.trim() === "" ||
				target.columnName.trim() === ""
			) {
				continue;
			}

			if (!tableMap.has(target.tableName)) {
				tableMap.set(target.tableName, new Set<string>());
			}

			tableMap.get(target.tableName)?.add(target.columnName);

			const sourcePolicy = file.tablePolicies.find(
				(policy) => policy.tableName === target.tableName,
			);
			if (
				sourcePolicy?.primaryKeyColumn &&
				sourcePolicy.primaryKeyColumn.trim() !== ""
			) {
				tableMap.get(target.tableName)?.add(sourcePolicy.primaryKeyColumn);
			}
		}
	}

	const allTables = Array.from(tableMap.entries()).map(([name, columns]) => ({
		name,
		columns: Array.from(columns),
	}));

	const addRelationship = () => {
		if (allTables.length < 2) return;

		const newRel: ForeignKeyDef = {
			id: generateId(),
			sourceTable: allTables[0].name,
			sourceColumn: allTables[0].columns[0] ?? "",
			targetTable: allTables[1].name,
			targetColumn: allTables[1].columns[0] ?? "",
		};
		onUpdate([...relationships, newRel]);
	};

	const updateRelationship = (id: string, updates: Partial<ForeignKeyDef>) => {
		onUpdate(
			relationships.map((r) => (r.id === id ? { ...r, ...updates } : r)),
		);
	};

	const removeRelationship = (id: string) => {
		onUpdate(relationships.filter((r) => r.id !== id));
	};

	return (
		<div className="space-y-6">
			<div className="bg-card border-2 border-border p-6 shadow-hardware">
				<div className="flex items-center justify-between mb-4 border-b-4 border-border pb-4">
					<h2 className="text-xl font-black uppercase tracking-wider text-foreground">
						3. FOREIGN KEY RELATIONSHIPS (OPTIONAL)
					</h2>
					<Button
						variant="outline"
						size="sm"
						onClick={addRelationship}
						disabled={allTables.length < 2}
						className="gap-2"
					>
						<Plus className="w-4 h-4" />
						ADD RELATIONSHIP
					</Button>
				</div>

				{relationships.length === 0 ? (
					<div className="text-center py-12 text-muted-foreground">
						<Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
						<p className="font-bold uppercase">No relationships defined</p>
						<p className="text-sm mt-2">
							You can skip this step if you don't need foreign keys
						</p>
					</div>
				) : (
					<div className="space-y-4">
						{relationships.map((rel) => {
							const sourceTable = allTables.find(
								(t) => t.name === rel.sourceTable,
							);
							const targetTable = allTables.find(
								(t) => t.name === rel.targetTable,
							);

							return (
								<div
									key={rel.id}
									className="flex items-center gap-4 p-4 bg-secondary border-2 border-border"
								>
									<div className="flex-1 space-y-2">
										<span className="text-xs font-bold uppercase text-muted-foreground">
											SOURCE TABLE
										</span>
										<Select
											value={rel.sourceTable}
											onValueChange={(v) =>
												updateRelationship(rel.id, {
													sourceTable: v,
													sourceColumn:
														allTables.find((t) => t.name === v)?.columns[0] ??
														"",
												})
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{allTables.map((t) => (
													<SelectItem key={t.name} value={t.name}>
														{t.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Select
											value={rel.sourceColumn}
											onValueChange={(v) =>
												updateRelationship(rel.id, { sourceColumn: v })
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{(sourceTable?.columns ?? []).map((c) => (
													<SelectItem key={c} value={c}>
														{c}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<ArrowRight className="w-6 h-6 text-primary shrink-0" />

									<div className="flex-1 space-y-2">
										<span className="text-xs font-bold uppercase text-muted-foreground">
											TARGET TABLE
										</span>
										<Select
											value={rel.targetTable}
											onValueChange={(v) =>
												updateRelationship(rel.id, {
													targetTable: v,
													targetColumn:
														allTables.find((t) => t.name === v)?.columns[0] ??
														"",
												})
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{allTables.map((t) => (
													<SelectItem key={t.name} value={t.name}>
														{t.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Select
											value={rel.targetColumn}
											onValueChange={(v) =>
												updateRelationship(rel.id, { targetColumn: v })
											}
										>
											<SelectTrigger className="h-8 rounded-none border-2 border-border text-sm font-bold">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-border font-mono bg-card">
												{(targetTable?.columns ?? []).map((c) => (
													<SelectItem key={c} value={c}>
														{c}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => removeRelationship(rel.id)}
										className="shrink-0 hover:bg-destructive hover:text-destructive-foreground"
									>
										<Trash2 className="w-4 h-4" />
									</Button>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
