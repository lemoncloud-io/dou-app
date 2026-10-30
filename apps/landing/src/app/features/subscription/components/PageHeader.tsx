import { type JSX, type ReactNode, createContext, useContext, useEffect } from 'react';

import { cn } from '../utils';

/**
 * How a page tells the account shell its name. On a phone the shell's top bar carries the page title
 * and the page itself shows only the subtitle; the page keeps no copy of the title for that width.
 */
export const AccountTitleContext = createContext<(title: string | undefined) => void>(() => undefined);

/**
 * A management page's head: the title and its one-line subtitle. From `md` the title is the page's own
 * heading; below it the shell's top bar shows it instead, so the heading steps aside.
 */
export const PageHeader = ({
    title,
    subtitle,
    className,
}: {
    title: string;
    subtitle?: ReactNode;
    className?: string;
}): JSX.Element => {
    const setTitle = useContext(AccountTitleContext);
    useEffect(() => {
        setTitle(title);
        return () => setTitle(undefined);
    }, [title, setTitle]);

    return (
        <header className={cn('flex flex-col gap-1.5', className)}>
            <h1 className="hidden text-[28px] font-bold leading-[1.5] text-ink md:block">{title}</h1>
            {subtitle && (
                <p className="text-sm font-medium leading-normal tracking-[-0.01em] text-mute md:text-[15px] md:leading-[1.5]">
                    {subtitle}
                </p>
            )}
        </header>
    );
};
