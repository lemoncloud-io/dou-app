import { useCallback, useState } from 'react';

import { ONBOARDING_STEPS } from '../consts';

export const useOnboardingNavigation = () => {
    const [currentStep, setCurrentStep] = useState(0);

    const totalSteps = ONBOARDING_STEPS.length;
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
