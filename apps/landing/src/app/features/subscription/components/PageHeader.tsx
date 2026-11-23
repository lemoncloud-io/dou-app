import { type JSX, type ReactNode, createContext, useContext, useEffect } from 'react';

import { cn } from '../utils';

export const AccountTitleContext = createContext<(title: string | undefined) => void>(() => undefined);

export const PageHeader = ({
    title,
    subtitle,
    barTitle,
    titleOnPhone = false,
    action,
    className,
}: {
    title: string;
    subtitle?: ReactNode;
    barTitle?: string;
    titleOnPhone?: boolean;
    action?: ReactNode;
    className?: string;
}): JSX.Element => {
    const setTitle = useContext(AccountTitleContext);
    const bar = barTitle ?? title;
    useEffect(() => {
        setTitle(bar);
        return () => setTitle(undefined);
    }, [bar, setTitle]);

    return (
        <header className={cn('flex items-start justify-between gap-4 md:gap-6', className)}>
            <div className="flex min-w-0 flex-col gap-1.5">
                <h1
                    className={cn(
                        'font-bold leading-[1.5] text-ink md:text-[28px]',
                        titleOnPhone ? 'text-[22px]' : 'hidden md:block'
                    )}
                >
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-sm font-medium leading-normal tracking-[-0.01em] text-mute md:text-[15px] md:leading-[1.5]">
                        {subtitle}
                    </p>
                )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </header>
    );
};
