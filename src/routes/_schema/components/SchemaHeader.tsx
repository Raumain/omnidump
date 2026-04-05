interface SchemaHeaderProps {
	connectionName: string;
}

export function SchemaHeader({ connectionName }: SchemaHeaderProps) {
	return (
		<div className="bg-card border-2 border-border p-6 shadow-hardware w-full">
			<h1 className="text-3xl font-black uppercase tracking-wider text-primary">
				SCHEMA_EXPLORER
			</h1>
			<div className="flex items-center gap-3 mt-2">
				<div className="w-3 h-3 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,150,0,0.8)]" />
				<p className="text-sm font-bold uppercase tracking-widest text-primary">
					STATUS: ONLINE
				</p>
				<span className="text-muted-foreground">|</span>
				<p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
					{connectionName}
				</p>
			</div>
		</div>
	);
}
