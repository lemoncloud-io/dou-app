import { useCallback, useState } from 'react';

/**
 * Step position for the onboarding modal. The count is passed in rather than read from a module
 * constant: the steps are built by `useOnboardingSteps`, whose copy is language- and
 * limit-dependent, and the constant that used to answer this carried a SECOND, Korean-only copy of
 * every string — one nothing rendered, and one that still promised the creation limits from before
 * ADR-0018 moved them. Counting the list the screen actually shows leaves one copy of it.
 */
export const useOnboardingNavigation = (totalSteps: number) => {
    const [currentStep, setCurrentStep] = useState(0);

    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === totalSteps - 1;

    const handleNext = useCallback(() => {
        if (!isLastStep) {
            setCurrentStep(prev => prev + 1);
        }
    }, [isLastStep]);

    const handlePrev = useCallback(() => {
        if (!isFirstStep) {
            setCurrentStep(prev => prev - 1);
        }
    }, [isFirstStep]);

    return {
        currentStep,
        totalSteps,
        isFirstStep,
        isLastStep,
        handleNext,
        handlePrev,
    };
};
