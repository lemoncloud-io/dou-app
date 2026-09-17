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
    const { currentStep, totalSteps, isFirstStep, isLastStep, handleNext, handlePrev } = useOnboardingNavigation(
        onboardingSteps.length
    );
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
                    {/* The track measures itself against its own container, never the viewport.
                        Steps used to be sized in viewport units, which is only the same thing
                        while the column happens to BE the viewport — on any device past the cap
                        each step was wider than the frame holding it, so the next step bled in at
                        the edge. Percentages of the track hold at every width: the track is
                        `totalSteps` frames wide, one frame is `100 / totalSteps` of it, and an
                        advance moves by that same fraction. */}
                    <div
                        className="flex h-full"
                        style={{
                            width: `${totalSteps * 100}%`,
                            transform: `translateX(calc(-${(currentStep * 100) / totalSteps}% + ${dragOffset}px))`,
                            transition: isDragging ? 'none' : 'transform 300ms ease-out',
                        }}
                    >
                        {onboardingSteps.map(step => (
                            <div
                                key={step.id}
                                className="h-full flex-shrink-0"
                                style={{ width: `${100 / totalSteps}%` }}
                            >
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
