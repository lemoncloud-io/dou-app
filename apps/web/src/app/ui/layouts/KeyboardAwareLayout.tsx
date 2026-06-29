import { type ReactNode } from 'react';

import { useAppChecker } from '@chatic/device-utils';

import { cn } from '@chatic/lib/utils';

interface KeyboardAwareLayoutProps {
    header?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    className?: string;
}

export const KeyboardAwareLayout = ({ header, footer, children, className }: KeyboardAwareLayoutProps) => {
    const { isIOS } = useAppChecker();

    return (
        <div className={cn('flex h-full flex-col bg-background pt-safe-top', className)}>
            {header && <div className="shrink-0">{header}</div>}
            <div className="flex-1 overflow-y-auto overscroll-none">{children}</div>
            {footer && (
                <>
                    <div className="shrink-0">{footer}</div>
                    <div
                        className="shrink-0 touch-none bg-background"
                        style={{
                            height: isIOS
                                ? 'calc(max(var(--safe-bottom, 0px), var(--keyboard-height, 0px)))'
                                : 'calc(var(--safe-bottom, 0px) + var(--keyboard-height, 0px))',
                        }}
                        onTouchMove={e => e.preventDefault()}
                    />
                </>
            )}
            {!footer && <div className="pb-safe-bottom" />}
        </div>
    );
};
