import { useCallback, useRef, useState } from 'react';

import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';

import { ONBOARDING_STEPS } from '../consts';
import { useOnboardingNavigation } from '../hooks';
import { OnboardingContent } from './OnboardingContent';
import { OnboardingFooter } from './OnboardingFooter';
import { OnboardingHeader } from './OnboardingHeader';

interface OnboardingModalProps {
    open: boolean;
    onComplete: () => void;
}

const SWIPE_THRESHOLD = 50;

export const OnboardingModal = ({ open, onComplete }: OnboardingModalProps) => {
    const { currentStep, totalSteps, isFirstStep, isLastStep, handleNext, handlePrev } = useOnboardingNavigation();
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const touchStartX = useRef(0);

    const handleSkip = () => {
        onComplete();
    };

    const handleComplete = () => {
        onComplete();
    };

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        setIsDragging(true);
    }, []);

    const onTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!isDragging) return;
            const currentX = e.touches[0].clientX;
            const diff = currentX - touchStartX.current;

            // 첫 스텝에서 오른쪽 스와이프 제한, 마지막 스텝에서 왼쪽 스와이프 제한
            if ((isFirstStep && diff > 0) || (isLastStep && diff < 0)) {
                setDragOffset(diff * 0.2); // 저항감
            } else {
                setDragOffset(diff);
            }
        },
        [isDragging, isFirstStep, isLastStep]
    );

    const onTouchEnd = useCallback(() => {
        setIsDragging(false);

        if (dragOffset < -SWIPE_THRESHOLD && !isLastStep) {
            handleNext();
        } else if (dragOffset > SWIPE_THRESHOLD && !isFirstStep) {
            handlePrev();
        }

        setDragOffset(0);
    }, [dragOffset, isFirstStep, isLastStep, handleNext, handlePrev]);

    return (
        <Dialog open={open}>
            <DialogContent
                hideClose
                variant="slide-up"
                className="m-0 max-w-full overflow-hidden rounded-none bg-white p-0"
                onPointerDownOutside={e => e.preventDefault()}
                onEscapeKeyDown={e => e.preventDefault()}
            >
                <div className="flex h-full w-screen flex-col">
                    <OnboardingHeader
                        currentStep={currentStep}
                        totalSteps={totalSteps}
                        isLastStep={isLastStep}
                        onSkip={handleSkip}
                    />

                    <div
                        className="relative flex-1 overflow-hidden"
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                    >
                        <div
                            className="flex h-full"
                            style={{
                                width: `${totalSteps * 100}vw`,
                                transform: `translateX(calc(-${currentStep * 100}vw + ${dragOffset}px))`,
                                transition: isDragging ? 'none' : 'transform 300ms ease-out',
                            }}
                        >
                            {ONBOARDING_STEPS.map(step => (
                                <div key={step.id} className="h-full w-screen flex-shrink-0">
                                    <OnboardingContent step={step} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <OnboardingFooter
                        isFirstStep={isFirstStep}
                        isLastStep={isLastStep}
                        onPrev={handlePrev}
                        onNext={handleNext}
                        onComplete={handleComplete}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};
