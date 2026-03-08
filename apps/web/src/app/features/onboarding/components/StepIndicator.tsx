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
                    className={`h-2 w-2 rounded-full transition-colors ${
                        index === currentStep ? 'bg-[#B0EA10]' : 'bg-[#DFE0E2]'
                    }`}
                />
            ))}
        </div>
    );
};
