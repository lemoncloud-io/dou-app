import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';

interface StepDotsProps {
    current: number;
    total: number;
}

export const StepDots = ({ current, total }: StepDotsProps) => {
    const { t } = useTranslation();

    return (
        <ol aria-label={t('auth.progress', { current, total })} className="flex justify-center gap-2">
            {Array.from({ length: total }, (_, i) => (
                <li
                    key={i}
                    aria-current={i + 1 === current ? 'step' : undefined}
                    className={cn(
                        'h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none',
                        i + 1 === current ? 'w-6 bg-foreground' : 'w-1.5 bg-border'
                    )}
                />
            ))}
        </ol>
    );
};
