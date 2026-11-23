import { useCallback, useState } from 'react';

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
