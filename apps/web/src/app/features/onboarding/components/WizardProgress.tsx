import { cn } from '@chatic/ui-kit';

interface WizardProgressProps {
    step: number;
    total: number;
}

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
