import { useCallback, useRef, useState } from 'react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';

import { useOnboardingNavigation, useOnboardingSteps } from '../hooks';
import { OnboardingContent } from './OnboardingContent';
import { OnboardingFooter } from './OnboardingFooter';
import { OnboardingHeader } from './OnboardingHeader';

interface OnboardingModalProps {
    open: boolean;
    onComplete: () => void;
}

const SWIPE_THRESHOLD = 50;

export const OnboardingModal = ({ open, onComplete }: OnboardingModalProps) => {
    const onboardingSteps = useOnboardingSteps();
    const { currentStep, totalSteps, isFirstStep, isLastStep, handleNext, handlePrev } = useOnboardingNavigation();
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const touchStartX = useRef(0);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        setIsDragging(true);
    }, []);

    const onTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!isDragging) return;
            const currentX = e.touches[0].clientX;
            const diff = currentX - touchStartX.current;

            if ((isFirstStep && diff > 0) || (isLastStep && diff < 0)) {
                setDragOffset(diff * 0.2);
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
        <Dialog open={open} onOpenChange={isOpen => !isOpen && onComplete()}>
            <DialogContent variant="slide-up" hideClose className="flex flex-col gap-0 bg-background">
                <DialogTitle className="sr-only">Onboarding</DialogTitle>
                <DialogDescription className="sr-only">Introduction to the app features</DialogDescription>
                <OnboardingHeader
                    currentStep={currentStep}
                    totalSteps={totalSteps}
                    isLastStep={isLastStep}
                    onSkip={onComplete}
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
                        {onboardingSteps.map(step => (
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
                    onComplete={onComplete}
                />
            </DialogContent>
        </Dialog>
    );
};
