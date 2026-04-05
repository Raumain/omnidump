import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Zap } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";

import Loader from "@/components/Loader.tsx";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useActiveConnection } from "@/hooks/use-active-connection.tsx";
import { getDatabaseSchemaFn } from "@/server/schema-fns";

export const Route = createFileRoute("/import")({ component: ImportPage });

const normalizeColumnName = (name: string) =>
	name.toLowerCase().replace(/[\s_-]/g, "");

function ImportPage() {
	const [file, setFile] = useState<File | null>(null);
	const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
	const [selectedTable, setSelectedTable] = useState("");
	const [mapping, setMapping] = useState<Record<string, string>>({});
	const [successfulCount, setSuccessfulCount] = useState(0);
	const [failedCount, setFailedCount] = useState(0);
	const [rejectFileName, setRejectFileName] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { activeConnection, isHydrated } = useActiveConnection();

	const schemaQuery = useQuery({
		queryKey: ["schema", activeConnection?.id],
		queryFn: async () => {
			if (!activeConnection) {
				throw new Error("No active connection selected.");
			}

			return getDatabaseSchemaFn({ data: activeConnection });
		},
		enabled: !!activeConnection,
	});

	const schemaData = schemaQuery.data;
	const schemaError =
		schemaData && "error" in schemaData ? schemaData.error : null;
	const tables = schemaData && Array.isArray(schemaData) ? schemaData : [];
	const selectedTableColumns =
		tables.find((table) => table.tableName === selectedTable)?.columns ?? [];

	const isMappingReady =
		csvHeaders.length > 0 &&
		csvHeaders.every((header) => Boolean(mapping[header]));

	const importMutation = useMutation({
		mutationFn: async (input: {
			file: File;
			connectionId: number;
			tableName: string;
			mapping: Record<string, string>;
		}) => {
			const formData = new FormData();
			formData.append("file", input.file);
			formData.append("connectionId", String(input.connectionId));
			formData.append("tableName", input.tableName);
			formData.append("mapping", JSON.stringify(input.mapping));

			const response = await fetch("/api/import", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorData = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				const message = errorData?.error ?? "Import failed.";
				throw new Error(message);
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (!reader) {
				throw new Error("Import stream is unavailable.");
			}

			let pendingChunk = "";

			const processEvent = (event: string) => {
				const dataLine = event
					.split("\n")
					.find((line) => line.startsWith("data: "));

				if (!dataLine) {
					return;
				}

				const payload = JSON.parse(dataLine.slice(6)) as {
					successfulRows?: number;
					failedRows?: number;
					status?: "processing" | "completed" | "failed";
					error?: string;
					rejectFileName?: string;
				};

				setSuccessfulCount(payload.successfulRows ?? 0);
				setFailedCount(payload.failedRows ?? 0);

				if (payload.status === "completed") {
					setRejectFileName(payload.rejectFileName ?? null);
				}

				if (payload.status === "failed") {
					throw new Error(payload.error ?? "Import failed.");
				}
			};

			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					break;
				}

				pendingChunk += decoder.decode(value, { stream: true });
				const events = pendingChunk.split("\n\n");
				pendingChunk = events.pop() ?? "";

				for (const event of events) {
					processEvent(event);
				}
			}

			const trailingEvent = pendingChunk.trim();

			if (trailingEvent) {
				processEvent(trailingEvent);
			}
		},
		onMutate: () => {
			setSuccessfulCount(0);
			setFailedCount(0);
			setRejectFileName(null);
		},
		onError: (error) => {
			const message = error instanceof Error ? error.message : "Import failed.";
			setErrorMessage(message);
		},
	});

	const canImport =
		Boolean(file) &&
		Boolean(selectedTable) &&
		isMappingReady &&
		!importMutation.isPending;

	const resetForm = () => {
		setFile(null);
		setCsvHeaders([]);
		setSelectedTable("");
		setMapping({});
		setSuccessfulCount(0);
		setFailedCount(0);
		setRejectFileName(null);
		importMutation.reset();

		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	useEffect(() => {
		if (!selectedTable || csvHeaders.length === 0) {
			return;
		}

		const tableColumns =
			tables.find((table) => table.tableName === selectedTable)?.columns ?? [];

		if (tableColumns.length === 0) {
			setMapping({});
			return;
		}

		const normalizedColumnLookup = new Map<string, string>();

		for (const column of tableColumns) {
			normalizedColumnLookup.set(normalizeColumnName(column.name), column.name);
		}

		const autoMapping: Record<string, string> = {};

		for (const header of csvHeaders) {
			const matchedColumn = normalizedColumnLookup.get(
				normalizeColumnName(header),
			);

			if (matchedColumn) {
				autoMapping[header] = matchedColumn;
			}
		}

		setMapping(autoMapping);
	}, [csvHeaders, selectedTable, tables]);

	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const nextFile = event.target.files?.[0] ?? null;

		setFile(nextFile);
		setMapping({});

		if (!nextFile) {
			setCsvHeaders([]);
			return;
		}

		const preview = await nextFile.slice(0, 1024).text();
		const [firstLine = ""] = preview.split("\n");
		const normalizedLine = firstLine.replace(/\r$/, "").trim();

		if (normalizedLine === "") {
			setCsvHeaders([]);
			return;
		}

		const commaCount = (normalizedLine.match(/,/g) ?? []).length;
		const semicolonCount = (normalizedLine.match(/;/g) ?? []).length;
		const delimiter = semicolonCount > commaCount ? ";" : ",";

		const headers = normalizedLine
			.split(delimiter)
			.map((header) => header.trim())
			.filter((header) => header !== "");

		setCsvHeaders(headers);
	};

	const handleImport = async () => {
		if (!file || !selectedTable || !activeConnection || !isMappingReady) {
			return;
		}

		importMutation.mutate({
			file,
			connectionId: activeConnection.id,
			tableName: selectedTable,
			mapping,
		});
	};

	if (!isHydrated) {
		return <Loader />;
	}

	if (!activeConnection) {
		return (
			<section className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center p-6 md:p-10 font-mono">
				<Card className="w-full max-w-md bg-card border-2 border-border p-6 shadow-hardware rounded-none">
					<CardHeader>
						<CardTitle className="text-2xl font-black uppercase tracking-wider text-primary">
							No active connection.
						</CardTitle>
					</CardHeader>
					<CardContent className="flex items-center justify-between gap-3 pt-6">
						<p className="text-sm font-bold uppercase text-muted-foreground">
							Select a saved connection to start.
						</p>
						<Button asChild>
							<Link to="/">Back</Link>
						</Button>
					</CardContent>
				</Card>
			</section>
		);
	}

	return (
		<section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 p-6 md:p-10 font-mono">
			<div className="flex flex-col gap-2 bg-card p-6 border-2 border-border shadow-hardware">
				<h1 className="text-3xl font-black uppercase tracking-wider text-primary">
					DATA_INJECTION_MODULE
				</h1>
				<div className="flex items-center gap-3">
					<div className="w-3 h-3 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,150,0,0.8)]" />
					<p className="text-sm font-bold uppercase tracking-widest text-primary">
						STATUS: READY
					</p>
					<span className="text-muted-foreground">|</span>
					<p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
						{activeConnection.name}
					</p>
				</div>
			</div>

			<Card className="bg-card border-2 border-border p-6 shadow-hardware rounded-none">
				<CardHeader className="p-0 mb-6 border-b-4 border-border pb-4">
					<CardTitle className="text-xl font-black uppercase tracking-wider text-foreground">
						1. INSERT CSV MEDIUM
					</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					<div className="border-4 border-dashed border-border bg-secondary p-8 text-center relative hover:bg-muted transition-colors">
						<Input
							ref={fileInputRef}
							type="file"
							accept=".csv"
							onChange={handleFileChange}
							className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
						/>
						<p className="text-lg font-black uppercase tracking-widest text-muted-foreground pointer-events-none">
							{file ? file.name : "CLICK OR DRAG MEDIA HERE"}
						</p>
					</div>
				</CardContent>
			</Card>

			<Card className="bg-card border-2 border-border p-6 shadow-hardware rounded-none">
				<CardHeader className="p-0 mb-6 border-b-4 border-border pb-4">
					<CardTitle className="text-xl font-black uppercase tracking-wider text-foreground">
						2. TARGET TABLE
					</CardTitle>
				</CardHeader>
				<CardContent className="p-0 space-y-3">
					{schemaQuery.isLoading ? (
						<p className="text-sm font-bold uppercase animate-pulse text-primary">
							Scanning structures...
						</p>
					) : null}

					{schemaError ? (
						<p className="text-sm font-bold uppercase text-destructive">
							{schemaError}
						</p>
					) : null}

					{!schemaQuery.isLoading && !schemaError ? (
						<div className="border-2 border-border p-2 bg-secondary">
							<Select
								value={selectedTable}
								onValueChange={(value) => {
									setSelectedTable(value);
									setMapping({});
								}}
							>
								<SelectTrigger className="w-full rounded-none border-2 border-border bg-card shadow-hardware text-foreground font-bold uppercase h-12 text-lg">
									<SelectValue placeholder="Select a table" />
								</SelectTrigger>
								<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
									{tables.map((table) => (
										<SelectItem
											key={table.tableName}
											value={table.tableName}
											className="rounded-none cursor-pointer focus:bg-primary focus:text-primary-foreground font-bold uppercase"
										>
											{table.tableName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}
				</CardContent>
			</Card>

			{file && selectedTable ? (
				<Card className="bg-card border-2 border-border p-6 shadow-hardware rounded-none">
					<CardHeader className="p-0 mb-6 border-b-4 border-border pb-4">
						<CardTitle className="text-xl font-black uppercase tracking-wider text-foreground">
							3. DATA MAPPING
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<div className="grid grid-cols-2 gap-4 border-b-4 border-border pb-4 text-sm font-black uppercase tracking-widest text-muted-foreground">
							<span>CSV HEADER</span>
							<span>DB COLUMN</span>
						</div>
						<div className="mt-4 space-y-4">
							{csvHeaders.map((header) => (
								<div
									key={header}
									className="grid grid-cols-1 gap-4 bg-secondary border-2 border-border p-4 sm:grid-cols-2 items-center"
								>
									<p className="truncate text-base font-bold bg-card px-3 py-2 border-2 border-border shadow-hardware -translate-x-1 -translate-y-1 text-foreground">
										{header}
									</p>
									<Select
										value={mapping[header]}
										onValueChange={(value) => {
											setMapping((prev) => ({ ...prev, [header]: value }));
										}}
									>
										<SelectTrigger className="w-full rounded-none border-2 border-border bg-card shadow-hardware font-bold h-10 text-foreground">
											<SelectValue placeholder="Select column" />
										</SelectTrigger>
										<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
											{selectedTableColumns.map((column) => (
												<SelectItem
													key={column.name}
													value={column.name}
													className="rounded-none cursor-pointer focus:bg-primary focus:text-primary-foreground font-bold uppercase"
												>
													{column.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							))}

							{csvHeaders.length === 0 ? (
								<p className="text-sm font-bold uppercase text-destructive">
									No CSV headers detected.
								</p>
							) : null}
						</div>
					</CardContent>
				</Card>
			) : null}

			{importMutation.isPending ||
			importMutation.isSuccess ||
			importMutation.isError ? (
				<Card className="bg-card border-2 border-border p-6 shadow-hardware rounded-none">
					<CardHeader className="p-0 mb-6 border-b-4 border-border pb-4">
						<CardTitle className="text-xl font-black uppercase tracking-wider text-foreground">
							INJECTION PROGRESS
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0 space-y-6">
						<div className="flex flex-col gap-2">
							<div className="flex justify-between font-black uppercase tracking-widest text-sm text-foreground">
								<span>Inserted</span>
								<span className="text-primary">{successfulCount}</span>
							</div>
							<div className="flex justify-between font-black uppercase tracking-widest text-sm text-foreground">
								<span>Failed</span>
								<span className="text-destructive">{failedCount}</span>
							</div>
							<div className="w-full h-8 bg-secondary border-2 border-border mt-2 relative overflow-hidden">
								{/* Physical LED Ladder representation */}
								<div
									className="h-full bg-primary transition-all duration-300 pattern-vertical-lines"
									style={{
										width:
											successfulCount + failedCount > 0
												? `${(successfulCount / (successfulCount + failedCount)) * 100}%`
												: "0%",
										backgroundImage:
											"linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.5) 50%)",
										backgroundSize: "10px 100%",
									}}
								/>
							</div>
						</div>

						{importMutation.isSuccess ? (
							<div className="flex flex-col gap-4 border-t-2 border-dashed border-border pt-4">
								<p className="font-black uppercase tracking-widest text-lg text-primary">
									PROCESS COMPLETE
								</p>
								<div className="flex flex-wrap items-center gap-4">
									{failedCount > 0 && rejectFileName ? (
										<Button variant="destructive" asChild>
											<a
												href={`/api/download-reject?fileName=${encodeURIComponent(rejectFileName)}`}
											>
												Download Rejects
											</a>
										</Button>
									) : null}

									<Button type="button" onClick={resetForm}>
										Reset Module
									</Button>
								</div>
							</div>
						) : null}
					</CardContent>
				</Card>
			) : null}

			<div className="mt-8 flex items-center justify-between gap-4 py-4 border-t-2 border-border">
				{!importMutation.isPending ? (
					<Button
						type="button"
						onClick={handleImport}
						disabled={!canImport}
						variant="accent"
						size="xl"
						className="flex-1 border-4 text-2xl tracking-widest disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-hardware flex items-center justify-center gap-3 h-20"
					>
						<Zap className="w-8 h-8" />
						INITIATE INJECTION
					</Button>
				) : null}
			</div>

			<AlertDialog
				open={!!errorMessage}
				onOpenChange={(open) => {
					if (!open) setErrorMessage(null);
				}}
			>
				<AlertDialogContent className="rounded-none border-4 border-destructive shadow-hardware font-mono p-6 bg-card">
					<AlertDialogHeader>
						<AlertDialogTitle className="text-2xl font-black uppercase text-destructive flex items-center gap-2">
							<AlertTriangle className="w-6 h-6" /> INJECTION ERROR
						</AlertDialogTitle>
						<AlertDialogDescription className="text-muted-foreground font-bold uppercase tracking-widest mt-4">
							{errorMessage}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="mt-6">
						<AlertDialogAction
							onClick={() => setErrorMessage(null)}
							className="rounded-none border-2 border-destructive shadow-hardware active:translate-x-0.5 active:translate-y-0.5 active:shadow-none font-bold uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
						>
							ACKNOWLEDGE
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
