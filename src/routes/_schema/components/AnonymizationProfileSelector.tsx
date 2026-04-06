import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { AnonymizationProfile } from "@/lib/anonymization-types";

interface AnonymizationProfileSelectorProps {
	profiles: AnonymizationProfile[];
	selectedProfileId: number | null;
	isLoading: boolean;
	isCreating: boolean;
	isDeleting: boolean;
	onSelect: (profileId: number | null) => void;
	onCreate: (name: string) => void;
	onDelete: (profileId: number) => void;
	onDuplicate: (profileId: number, newName: string) => void;
}

export function AnonymizationProfileSelector({
	profiles,
	selectedProfileId,
	isLoading,
	isCreating,
	isDeleting,
	onSelect,
	onCreate,
	onDelete,
	onDuplicate,
}: AnonymizationProfileSelectorProps) {
	const [isCreatingNew, setIsCreatingNew] = useState(false);
	const [newProfileName, setNewProfileName] = useState("");

	const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

	const handleCreate = () => {
		if (newProfileName.trim()) {
			onCreate(newProfileName.trim());
			setNewProfileName("");
			setIsCreatingNew(false);
		}
	};

	const handleDuplicate = () => {
		if (selectedProfile) {
			onDuplicate(selectedProfile.id, `${selectedProfile.name} (Copy)`);
		}
	};

	if (isCreatingNew) {
		return (
			<div className="space-y-2">
				<span className="font-bold uppercase text-sm block">New Profile</span>
				<div className="flex gap-2">
					<input
						type="text"
						value={newProfileName}
						onChange={(e) => setNewProfileName(e.target.value)}
						placeholder="Profile name..."
						className="flex-1 px-3 py-2 border-2 border-border bg-card font-mono text-sm focus:outline-none focus:border-primary"
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreate();
							if (e.key === "Escape") setIsCreatingNew(false);
						}}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setIsCreatingNew(false)}
						className="rounded-none border-2 border-border shadow-hardware font-bold uppercase"
					>
						Cancel
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={handleCreate}
						disabled={!newProfileName.trim() || isCreating}
						className="rounded-none border-2 border-primary shadow-hardware font-bold uppercase bg-primary text-primary-foreground"
					>
						{isCreating ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							"Create"
						)}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<span className="font-bold uppercase text-sm block">
				Anonymization Profile
			</span>
			<div className="flex gap-2">
				<Select
					value={selectedProfileId?.toString() ?? ""}
					onValueChange={(value) => onSelect(value ? Number(value) : null)}
					disabled={isLoading}
				>
					<SelectTrigger className="flex-1 rounded-none border-2 border-border shadow-hardware bg-card text-foreground font-bold uppercase">
						<SelectValue
							placeholder={isLoading ? "Loading..." : "Select a profile..."}
						/>
					</SelectTrigger>
					<SelectContent className="rounded-none border-2 border-primary shadow-hardware font-mono bg-card">
						{profiles.length === 0 ? (
							<div className="p-2 text-sm text-muted-foreground">
								No profiles yet
							</div>
						) : (
							profiles.map((profile) => (
								<SelectItem
									key={profile.id}
									value={profile.id.toString()}
									className="font-bold rounded-none focus:bg-primary focus:text-primary-foreground cursor-pointer"
								>
									<span>{profile.name}</span>
									<span className="text-muted-foreground ml-2 text-xs">
										({profile.ruleCount ?? 0} rules)
									</span>
								</SelectItem>
							))
						)}
					</SelectContent>
				</Select>

				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={() => setIsCreatingNew(true)}
					title="Create new profile"
					className="rounded-none border-2 border-border shadow-hardware"
				>
					<Plus className="w-4 h-4" />
				</Button>

				{selectedProfile && (
					<>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={handleDuplicate}
							disabled={isCreating}
							title="Duplicate profile"
							className="rounded-none border-2 border-border shadow-hardware"
						>
							<Copy className="w-4 h-4" />
						</Button>

						<Button
							type="button"
							variant="destructive"
							size="icon"
							onClick={() => onDelete(selectedProfile.id)}
							disabled={isDeleting}
							title="Delete profile"
							className="rounded-none border-2 border-destructive shadow-hardware"
						>
							{isDeleting ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Trash2 className="w-4 h-4" />
							)}
						</Button>
					</>
				)}
			</div>

			{selectedProfile && (
				<p className="text-xs text-muted-foreground">
					Last updated:{" "}
					{new Date(selectedProfile.updatedAt).toLocaleDateString()}
				</p>
			)}
		</div>
	);
}
