import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@chatic/lib/utils';

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
const ANIMATION_DURATION = 400;

export const OnboardingModal = ({ open, onComplete }: OnboardingModalProps) => {
    const { currentStep, totalSteps, isFirstStep, isLastStep, handleNext, handlePrev } = useOnboardingNavigation();
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const touchStartX = useRef(0);

    useEffect(() => {
        if (open) {
            setIsVisible(true);
            requestAnimationFrame(() => {
                setIsAnimating(true);
            });
        } else if (isVisible) {
            setIsAnimating(false);
            const timer = setTimeout(() => {
                setIsVisible(false);
            }, ANIMATION_DURATION);
            return () => clearTimeout(timer);
        }
    }, [open, isVisible]);

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

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 z-50">
            {/* Backdrop */}
            <div
                className={cn(
                    'absolute inset-0 bg-black transition-opacity duration-[400ms] ease-out',
                    isAnimating ? 'opacity-50' : 'opacity-0'
                )}
            />

            {/* Modal */}
            <div
                className={cn(
                    'absolute inset-0 bg-white transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]',
                    isAnimating ? 'translate-y-0' : 'translate-y-full'
                )}
            >
                <div className="flex h-full w-screen flex-col">
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
                        onComplete={onComplete}
                    />
                </div>
            </div>
        </div>
    );
};
