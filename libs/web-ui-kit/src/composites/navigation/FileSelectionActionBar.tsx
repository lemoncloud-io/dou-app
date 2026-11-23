import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

export interface FileSelectionAction {
    key: string;
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    destructive?: boolean;
}

export interface FileSelectionActionBarProps {
    actions: FileSelectionAction[];
    notice?: string;
    label?: string;
    className?: string;
}

export const FileSelectionActionBar = ({
    actions,
    notice,
    label = 'Selection actions',
    className,
}: FileSelectionActionBarProps) => {
    const ref = React.useRef<HTMLDivElement>(null);
    const [height, setHeight] = React.useState<number | null>(null);

    React.useLayoutEffect(() => {
        const next = ref.current?.offsetHeight || null;
        if (next !== height) setHeight(next);
    });
    useToastLift(height);

    return (
        <div
            ref={ref}
            className={cn(
                'fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[var(--app-width,430px)] border-t border-input-border bg-surface px-3 pt-4',
                'duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-4 motion-reduce:animate-none',
                className
            )}
            style={{ paddingBottom: 'max(24px, calc(var(--safe-bottom, 0px) + 8px))' }}
        >
            {notice && (
                <p className="mx-1 mb-4 rounded-[10px] bg-action-soft px-3 py-2.5 text-[13px] font-medium leading-normal text-label">
                    {notice}
                </p>
            )}
            <div role="toolbar" aria-label={label} className="flex items-start justify-between">
                {actions.map(action => (
                    <button
                        key={action.key}
                        type="button"
                        onClick={action.onPress}
                        disabled={action.disabled}
                        data-destructive={action.destructive || undefined}
                        className={cn(
                            'flex w-20 shrink-0 flex-col items-center gap-1 transition-opacity duration-150 active:opacity-60 disabled:opacity-30 motion-reduce:transition-none',
                            action.destructive ? 'text-alert-red' : 'text-foreground'
                        )}
                    >
                        <span aria-hidden className="flex size-6 items-center justify-center">
                            {action.icon}
                        </span>
                        <span
                            className={cn(
                                'whitespace-nowrap text-[12px] font-medium leading-normal',
                                !action.destructive && 'text-label'
                            )}
                        >
                            {action.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};
