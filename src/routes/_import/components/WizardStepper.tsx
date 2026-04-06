import {
	Check,
	ChevronRight,
	Link2,
	Settings2,
	Upload,
	Zap,
} from "lucide-react";

import type { ImportWizardStep } from "#/lib/csv-import-types";
import { cn } from "#/lib/utils";

import { STEP_LABELS, STEP_ORDER } from "../types";

const STEP_ICONS: Record<ImportWizardStep, React.ReactNode> = {
	upload: <Upload className="w-5 h-5" />,
	configure: <Settings2 className="w-5 h-5" />,
	relationships: <Link2 className="w-5 h-5" />,
	import: <Zap className="w-5 h-5" />,
};

type WizardStepperProps = {
	currentStep: ImportWizardStep;
	completedSteps: ImportWizardStep[];
};

export function WizardStepper({
	currentStep,
	completedSteps,
}: WizardStepperProps) {
	return (
		<div className="flex items-center gap-2 bg-card p-4 border-2 border-border shadow-hardware overflow-x-auto">
			{STEP_ORDER.map((step, index) => {
				const isCompleted = completedSteps.includes(step);
				const isCurrent = step === currentStep;

				return (
					<div key={step} className="flex items-center gap-2">
						<div
							className={cn(
								"flex items-center gap-2 px-4 py-2 border-2 font-bold uppercase text-sm transition-colors",
								isCurrent &&
									"bg-primary text-primary-foreground border-primary shadow-hardware",
								isCompleted &&
									!isCurrent &&
									"bg-secondary text-foreground border-border",
								!isCurrent &&
									!isCompleted &&
									"bg-muted text-muted-foreground border-border",
							)}
						>
							{isCompleted && !isCurrent ? (
								<Check className="w-4 h-4 text-primary" />
							) : (
								STEP_ICONS[step]
							)}
							<span className="hidden sm:inline">{STEP_LABELS[step]}</span>
						</div>
						{index < STEP_ORDER.length - 1 && (
							<ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
						)}
					</div>
				);
			})}
		</div>
	);
}
