import { Button } from '@chatic/ui-kit/components/ui/button';

interface OnboardingFooterProps {
    isFirstStep: boolean;
    isLastStep: boolean;
    onPrev: () => void;
    onNext: () => void;
    onComplete: () => void;
}

export const OnboardingFooter = ({ isFirstStep, isLastStep, onPrev, onNext, onComplete }: OnboardingFooterProps) => {
    return (
        <div className="flex gap-3 px-6 pb-8 pt-4">
            {!isFirstStep && (
                <Button
                    variant="outline"
                    onClick={onPrev}
                    className="h-[52px] flex-1 rounded-xl border-[#DFE0E2] text-[16px] font-semibold text-[#3A3C40]"
                >
                    이전
                </Button>
            )}
            {isLastStep ? (
                <Button
                    onClick={onComplete}
                    className="h-[52px] flex-1 rounded-xl bg-[#B0EA10] text-[16px] font-semibold text-[#222325] hover:bg-[#9DD00E]"
                >
                    완료
                </Button>
            ) : (
                <Button
                    onClick={onNext}
                    className="h-[52px] flex-1 rounded-xl bg-[#B0EA10] text-[16px] font-semibold text-[#222325] hover:bg-[#9DD00E]"
                >
                    다음
                </Button>
            )}
        </div>
    );
};
