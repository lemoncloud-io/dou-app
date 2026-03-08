import { cn } from '@chatic/lib/utils';

interface StepIndicatorProps {
    currentStep: number;
    totalSteps: number;
}

export const StepIndicator = ({ currentStep, totalSteps }: StepIndicatorProps) => {
    return (
        <div className="flex items-center gap-2">
            {Array.from({ length: totalSteps }, (_, index) => (
                <div
                    key={index}
                    className={cn(
                        'h-2 w-2 rounded-full transition-colors',
                        index === currentStep ? 'bg-primary' : 'bg-muted'
                    )}
                />
            ))}
        </div>
    );
};
