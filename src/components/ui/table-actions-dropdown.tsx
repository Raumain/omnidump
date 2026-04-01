import { MoreVertical } from "lucide-react";
import * as React from "react";
import { cn } from "#/lib/utils";
import { Button } from "./button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./dropdown-menu";

interface TableAction {
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
	variant?: "default" | "destructive";
	disabled?: boolean;
}

interface TableActionsDropdownProps {
	actions: TableAction[];
	className?: string;
}

function TableActionsDropdown({
	actions,
	className,
}: TableActionsDropdownProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className={cn(
						"rounded-none border-2 border-transparent",
						"hover:border-primary hover:bg-transparent hover:text-primary",
						"data-[state=open]:border-primary data-[state=open]:text-primary",
						"transition-none",
						className,
					)}
				>
					<MoreVertical className="w-4 h-4" />
					<span className="sr-only">Actions</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className={cn(
					"rounded-none border-2 border-border",
					"bg-card shadow-hardware",
					"font-mono min-w-[160px]",
				)}
			>
				{actions.map((action, index) => (
					<React.Fragment key={action.label}>
						{index > 0 &&
							action.variant === "destructive" &&
							actions[index - 1]?.variant !== "destructive" && (
								<DropdownMenuSeparator className="bg-border" />
							)}
						<DropdownMenuItem
							onClick={action.onClick}
							disabled={action.disabled}
							className={cn(
								"rounded-none cursor-pointer font-bold uppercase text-xs",
								"focus:bg-primary focus:text-primary-foreground",
								"transition-none",
								action.variant === "destructive" &&
									"text-destructive focus:bg-destructive focus:text-white",
							)}
						>
							{action.icon && <span className="mr-2">{action.icon}</span>}
							{action.label}
						</DropdownMenuItem>
					</React.Fragment>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { TableActionsDropdown };
export type { TableAction };
