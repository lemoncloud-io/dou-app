import type { OnboardingStep } from '../consts';

interface OnboardingContentProps {
    step: OnboardingStep;
}

export const OnboardingContent = ({ step }: OnboardingContentProps) => {
    return (
        <div className="flex h-full flex-col items-center justify-center px-6">
            {/* Placeholder for app screenshot image */}
            <div className="mb-8 flex h-[300px] w-full max-w-[280px] items-center justify-center rounded-2xl bg-muted">
                <span className="text-muted-foreground">App Preview</span>
            </div>

            {/* Title */}
            <h1 className="mb-3 text-center text-[24px] font-bold leading-[1.3] tracking-[-0.02em] text-foreground">
                {step.title}
            </h1>

            {/* Description */}
            <p className="whitespace-pre-line text-center text-[15px] leading-[1.5] tracking-[-0.01em] text-muted-foreground">
                {step.description}
            </p>
        </div>
    );
};
