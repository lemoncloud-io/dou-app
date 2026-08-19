import { cn } from '@chatic/lib/utils';

interface WizardProgressProps {
    /** 1-based. */
    step: number;
    total: number;
}

/**
 * The setup wizard's progress rail — dots joined by a line, filled up to the current step.
 *
 * Distinct from `StepIndicator`, which the first-run carousel uses: that one marks *which* slide of
 * several you are on and any of them is reachable, so its dots are unconnected and only the current
 * one is filled. Here the steps are a sequence you advance through, and the rail says how far along
 * you are.
 */
export const WizardProgress = ({ step, total }: WizardProgressProps) => (
    <div className="flex items-center justify-center" role="progressbar" aria-valuenow={step} aria-valuemax={total}>
        {Array.from({ length: total }, (_, i) => {
            const index = i + 1;
            const reached = index <= step;
            return (
                <div key={index} className="flex items-center">
                    {index > 1 && (
                        <span className={cn('h-[2px] w-[52px]', reached ? 'bg-[#B0EA10]' : 'bg-[#E5E7E3]')} />
                    )}
                    <span className={cn('size-[10px] rounded-full', reached ? 'bg-[#B0EA10]' : 'bg-[#E5E7E3]')} />
                </div>
            );
        })}
    </div>
);
