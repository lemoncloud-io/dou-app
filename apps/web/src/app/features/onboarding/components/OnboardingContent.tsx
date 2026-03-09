import type { OnboardingStep } from '../consts';

interface OnboardingContentProps {
    step: OnboardingStep;
}

export const OnboardingContent = ({ step }: OnboardingContentProps) => {
    return (
        <div className="flex h-full flex-col px-6 pt-4">
            {/* Title */}
            <h1 className="mb-2 text-[24px] font-bold leading-[1.3] tracking-[-0.02em] text-foreground">
                {step.title}
            </h1>

            {/* Description */}
            <p className="mb-6 whitespace-pre-line text-[15px] leading-[1.5] tracking-[-0.01em] text-muted-foreground">
                {step.description}
            </p>

            {/* App Screenshot Image */}
            <div className="flex flex-1 items-center justify-center overflow-hidden">
                <img
                    src={step.image}
                    alt={step.title}
                    className="h-auto max-h-full w-full max-w-[320px] rounded-2xl object-contain"
                />
            </div>
        </div>
    );
};
