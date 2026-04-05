import { Loader2 } from "lucide-react";

export default function Loader() {
	return (
		<section className="mx-auto flex min-h-screen w-full items-center justify-center p-6 md:p-10 font-mono">
			<div className="bg-card border-2 border-border p-6 shadow-hardware w-full max-w-md">
				<div className="flex items-center gap-3 text-primary">
					<Loader2 className="w-6 h-6 animate-spin" />
					<h2 className="text-2xl font-black uppercase tracking-wider">
						Loading...
					</h2>
				</div>
				<p className="text-muted-foreground font-bold mt-4">
					Restoring application state.
				</p>
			</div>
		</section>
	);
}
