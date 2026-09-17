import type { OnboardingStep } from '../types';

interface OnboardingContentProps {
    step: OnboardingStep;
}

/** Longest comfortable measure for a paragraph here. A 690px column would otherwise run a line of
 *  Korean well past 40 characters, which is where a paragraph stops being read and starts being
 *  scanned. The column still fills the device; only the words inside it stop. */
const READING_WIDTH = 'max-w-[480px]';

export const OnboardingContent = ({ step }: OnboardingContentProps) => {
    return (
        <div className={`mx-auto flex h-full w-full flex-col px-6 pt-4 ${READING_WIDTH}`}>
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
