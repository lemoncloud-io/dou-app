import { useTranslation } from 'react-i18next';

import { Button } from '@chatic/ui-kit/components/ui/button';

interface OnboardingFooterProps {
    isFirstStep: boolean;
    isLastStep: boolean;
    onPrev: () => void;
    onNext: () => void;
    onComplete: () => void;
}

export const OnboardingFooter = ({ isFirstStep, isLastStep, onPrev, onNext, onComplete }: OnboardingFooterProps) => {
    const { t } = useTranslation();
    return (
        <div className="flex gap-3 px-6 pb-8 pt-4">
            {!isFirstStep && (
                <Button
                    variant="outline"
                    onClick={onPrev}
                    className="h-[52px] flex-1 rounded-xl border-border text-[16px] font-semibold text-foreground"
                >
                    {t('onboarding.prev')}
                </Button>
            )}
            <Button
                onClick={isLastStep ? onComplete : onNext}
                className="h-[52px] flex-1 rounded-xl bg-primary text-[16px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
                {isLastStep ? t('onboarding.done') : t('onboarding.next')}
            </Button>
        </div>
    );
};
