import { FileSpreadsheet, Upload, X } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	analyzeColumns,
	type CsvFileConfig,
	fileNameToTableName,
	generateId,
} from "#/lib/csv-import-types";
import { extractErrorMessage } from "#/lib/errors";
import { analyzeCsvFn } from "#/server/csv-import-fns";

type UploadStepProps = {
	csvFiles: CsvFileConfig[];
	onUpdate: (files: CsvFileConfig[]) => void;
	setErrorMessage: (msg: string | null) => void;
};

export function UploadStep({
	csvFiles,
	onUpdate,
	setErrorMessage,
}: UploadStepProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isProcessing, setIsProcessing] = useState(false);

	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? []);
		if (files.length === 0) return;

		setIsProcessing(true);

		try {
			const newConfigs: CsvFileConfig[] = [];

			for (const file of files) {
				const content = await file.text();
				const result = await analyzeCsvFn({ data: { fileContent: content } });

				if (!result.success) {
					setErrorMessage(`Failed to analyze ${file.name}: ${result.error}`);
					continue;
				}

				const columns = analyzeColumns(result.headers, result.sampleRows);
				const tableName = fileNameToTableName(file.name);

				const config: CsvFileConfig = {
					id: generateId(),
					file,
					fileName: file.name,
					fileSize: file.size,
					headers: result.headers,
					sampleRows: result.sampleRows,
					columns,
					tableMode: "create",
					tableName,
					mapping: {},
					primaryKeyColumn: null,
					importMode: "simple",
					advancedMapping: Object.fromEntries(
						result.headers.map((header) => [header, null]),
					),
					tablePolicies: [],
					rowLinkStrategy: {
						mode: "explicit_fk",
						links: [],
					},
				};

				newConfigs.push(config);
			}

			onUpdate([...csvFiles, ...newConfigs]);
		} catch (error) {
			setErrorMessage(extractErrorMessage(error, "Failed to process files"));
		} finally {
			setIsProcessing(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleRemoveFile = (id: string) => {
		onUpdate(csvFiles.filter((f) => f.id !== id));
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<div className="space-y-6">
			{/* Drop Zone */}
			<div className="bg-card border-2 border-border p-6 shadow-hardware">
				<h2 className="text-xl font-black uppercase tracking-wider text-foreground mb-4 border-b-4 border-border pb-4">
					1. UPLOAD CSV FILES
				</h2>
				<div className="border-4 border-dashed border-border bg-secondary p-12 text-center relative hover:bg-muted transition-colors">
					<Input
						ref={fileInputRef}
						type="file"
						accept=".csv"
						multiple
						onChange={handleFileChange}
						disabled={isProcessing}
						className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait"
					/>
					<Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
					<p className="text-lg font-black uppercase tracking-widest text-muted-foreground pointer-events-none">
						{isProcessing
							? "PROCESSING..."
							: "DROP CSV FILES HERE OR CLICK TO BROWSE"}
					</p>
					<p className="text-sm font-bold text-muted-foreground mt-2">
						Multiple files supported
					</p>
				</div>
			</div>

			{/* File List */}
			{csvFiles.length > 0 && (
				<div className="bg-card border-2 border-border p-6 shadow-hardware">
					<h2 className="text-xl font-black uppercase tracking-wider text-foreground mb-4 border-b-4 border-border pb-4">
						QUEUED FILES ({csvFiles.length})
					</h2>
					<div className="space-y-3">
						{csvFiles.map((csv) => (
							<div
								key={csv.id}
								className="flex items-center justify-between gap-4 p-4 bg-secondary border-2 border-border"
							>
								<div className="flex items-center gap-3 min-w-0">
									<FileSpreadsheet className="w-6 h-6 text-primary shrink-0" />
									<div className="min-w-0">
										<p className="font-bold truncate">{csv.fileName}</p>
										<p className="text-sm text-muted-foreground">
											{csv.headers.length} columns •{" "}
											{formatFileSize(csv.fileSize)}
										</p>
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() => handleRemoveFile(csv.id)}
									className="shrink-0 hover:bg-destructive hover:text-destructive-foreground"
								>
									<X className="w-4 h-4" />
								</Button>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
