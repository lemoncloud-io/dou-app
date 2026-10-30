import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

interface StepDotsProps {
    /** 1-based position of the step on screen. */
    current: number;
    total: number;
}

/**
 * Where the person is in a short, fixed sequence. The dots carry no label of their own, so the list
 * is named with the position ("Step 2 of 3") — otherwise a screen reader announces three empty items.
 */
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
