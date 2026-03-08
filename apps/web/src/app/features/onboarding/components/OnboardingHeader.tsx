import { cn } from '@chatic/lib/utils';

import { StepIndicator } from './StepIndicator';

interface OnboardingHeaderProps {
    currentStep: number;
    totalSteps: number;
    isLastStep: boolean;
    onSkip: () => void;
}

export const OnboardingHeader = ({ currentStep, totalSteps, isLastStep, onSkip }: OnboardingHeaderProps) => {
    return (
        <div className="flex items-center justify-between px-6 py-4">
            <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />
            <button
                onClick={onSkip}
                disabled={isLastStep}
                className={cn(
                    'text-[15px] font-medium',
                    isLastStep ? 'cursor-not-allowed text-muted' : 'text-muted-foreground'
                )}
            >
                SKIP
            </button>
        </div>
    );
};
