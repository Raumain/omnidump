import { Loader2, Upload, Zap } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface ColumnInfo {
	name: string;
	dataType: string;
	isNullable: boolean;
}

interface ImportDrawerProps {
	isOpen: boolean;
	selectedTable: string | null;
	tableColumns: ColumnInfo[];
	csvFile: File | null;
	csvHeaders: string[];
	columnMapping: Record<string, string>;
	importSuccessCount: number;
	importFailedCount: number;
	rejectFileName: string | null;
	isImporting: boolean;
	isImportSuccess: boolean;
	isMappingReady: boolean;
	csvFileInputRef: RefObject<HTMLInputElement | null>;
	onOpenChange: (open: boolean) => void;
	onCsvFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onColumnMappingChange: (header: string, column: string) => void;
	onImport: () => void;
	onReset: () => void;
}

export function ImportDrawer({
	isOpen,
	selectedTable,
	tableColumns,
	csvFile,
	csvHeaders,
	columnMapping,
	importSuccessCount,
	importFailedCount,
	rejectFileName,
	isImporting,
	isImportSuccess,
	isMappingReady,
	csvFileInputRef,
	onOpenChange,
	onCsvFileChange,
	onColumnMappingChange,
	onImport,
	onReset,
}: ImportDrawerProps) {
	return (
		<Drawer open={isOpen} onOpenChange={onOpenChange}>
			<DrawerContent className="w-[40%]">
				<DrawerHeader>
					<DrawerTitle>
						<Upload className="w-5 h-5 inline-block mr-2" />
						Import CSV to {selectedTable}
					</DrawerTitle>
					<DrawerDescription>
						Map CSV columns to database columns
					</DrawerDescription>
				</DrawerHeader>

				<DrawerBody>
					{/* File Upload */}
					<div className="mb-6">
						<p className="text-xs font-black uppercase tracking-widest mb-2 text-muted-foreground">
							1. Select CSV File
						</p>
						<div className="border-4 border-dashed border-border bg-secondary p-6 text-center relative hover:bg-muted transition-colors">
							<Input
								ref={csvFileInputRef}
								type="file"
								accept=".csv"
								onChange={onCsvFileChange}
								className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
							/>
							<p className="text-sm font-black uppercase tracking-widest text-muted-foreground pointer-events-none">
								{csvFile ? csvFile.name : "Click or drag file here"}
							</p>
						</div>
					</div>

					{/* Column Mapping */}
					{csvFile && csvHeaders.length > 0 ? (
						<div className="mb-6">
							<p className="text-xs font-black uppercase tracking-widest mb-2 text-muted-foreground">
								2. Map Columns
							</p>
							<div className="grid grid-cols-2 gap-2 border-b-2 border-border pb-2 text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
								<span>CSV Header</span>
								<span>DB Column</span>
							</div>
							<div className="space-y-3 overflow-y-auto">
								{csvHeaders.map((header) => (
									<div
										key={header}
										className="grid grid-cols-2 gap-3 items-center bg-secondary border-2 border-border p-3"
									>
										<p className="truncate text-sm font-bold text-foreground">
											{header}
										</p>
										<Select
											value={columnMapping[header] ?? ""}
											onValueChange={(value) => {
												onColumnMappingChange(header, value);
											}}
										>
											<SelectTrigger className="w-full rounded-none border-2 border-border bg-card shadow-hardware font-bold h-9 text-foreground text-sm">
												<SelectValue placeholder="Select" />
											</SelectTrigger>
											<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
												{tableColumns.map((column) => (
													<SelectItem
														key={column.name}
														value={column.name}
														className="rounded-none cursor-pointer focus:bg-primary focus:text-primary-foreground font-bold uppercase text-sm"
													>
														{column.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								))}
							</div>
						</div>
					) : null}

					{/* Import Progress */}
					{isImporting || isImportSuccess ? (
						<div className="mb-6 bg-secondary border-2 border-border p-4">
							<p className="text-xs font-black uppercase tracking-widest mb-3 text-muted-foreground">
								Import Progress
							</p>
							<div className="flex justify-between font-bold uppercase tracking-widest text-sm text-foreground mb-2">
								<span>Inserted</span>
								<span className="text-primary">{importSuccessCount}</span>
							</div>
							<div className="flex justify-between font-bold uppercase tracking-widest text-sm text-foreground mb-2">
								<span>Failed</span>
								<span className="text-destructive">{importFailedCount}</span>
							</div>
							<div className="w-full h-6 bg-card border-2 border-border mt-2 relative overflow-hidden">
								<div
									className="h-full bg-primary transition-all duration-300"
									style={{
										width:
											importSuccessCount + importFailedCount > 0
												? `${(importSuccessCount / (importSuccessCount + importFailedCount)) * 100}%`
												: "0%",
										backgroundImage:
											"linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.5) 50%)",
										backgroundSize: "10px 100%",
									}}
								/>
							</div>

							{isImportSuccess && importFailedCount > 0 && rejectFileName ? (
								<Button variant="destructive" className="mt-4 w-full" asChild>
									<a
										href={`/api/download-reject?fileName=${encodeURIComponent(rejectFileName)}`}
									>
										Download Rejects
									</a>
								</Button>
							) : null}
						</div>
					) : null}
				</DrawerBody>

				<DrawerFooter>
					{isImportSuccess ? (
						<>
							<Button type="button" onClick={onReset}>
								Import Another File
							</Button>
							<DrawerClose asChild>
								<Button type="button" variant="outline">
									Close
								</Button>
							</DrawerClose>
						</>
					) : (
						<>
							<Button
								type="button"
								variant="accent"
								onClick={onImport}
								disabled={!csvFile || !isMappingReady || isImporting}
								className="flex items-center gap-2"
							>
								{isImporting ? (
									<Loader2 className="animate-spin w-4 h-4" />
								) : (
									<Zap className="w-4 h-4" />
								)}
								{isImporting ? "Importing..." : "Start Import"}
							</Button>
							<DrawerClose asChild>
								<Button type="button" variant="outline">
									Cancel
								</Button>
							</DrawerClose>
						</>
					)}
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
