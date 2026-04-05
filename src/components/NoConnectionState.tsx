import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

interface NoConnectionStateProps {
	title?: string;
	message?: string;
}

export function NoConnectionState({
	title = "No active connection.",
	message = "Select a saved connection to continue.",
}: NoConnectionStateProps) {
	return (
		<section className="mx-auto flex min-h-screen w-full items-center justify-center p-6 md:p-10 font-mono">
			<div className="bg-card border-2 border-border p-6 shadow-hardware w-full max-w-md">
				<h2 className="text-2xl font-black uppercase tracking-wider text-primary mb-4">
					{title}
				</h2>
				<p className="text-muted-foreground font-bold mb-6">{message}</p>
				<Button asChild>
					<Link to="/">Back to connections</Link>
				</Button>
			</div>
		</section>
	);
}
