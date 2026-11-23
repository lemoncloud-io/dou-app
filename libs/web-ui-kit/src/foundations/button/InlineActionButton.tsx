import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { Button } from './Button';
import { FLOATING_PANEL } from './floatingPanel';

export interface InlineActionButtonProps {
    amount: React.ReactNode;
    originalAmount?: React.ReactNode;
    label: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    className?: string;
    wrapperClassName?: string;
}

export const InlineActionButton = React.forwardRef<HTMLButtonElement, InlineActionButtonProps>(
    ({ amount, originalAmount, label, onClick, disabled = false, className, wrapperClassName }, ref) => {
        return (
            <div className={cn(FLOATING_PANEL, wrapperClassName)}>
                <div className="flex w-full items-center">
                    <div className="flex flex-1 items-center gap-1.5">
                        {originalAmount && (
                            <span className="text-[20px] font-medium text-muted-foreground line-through">
                                {originalAmount}
                            </span>
                        )}
                        <span className="text-[24px] font-semibold text-foreground">{amount}</span>
                    </div>
                    <Button
                        ref={ref}
                        tone="black"
                        size="lg"
                        onClick={onClick}
                        disabled={disabled}
                        className={cn('w-[132px]', className)}
                    >
                        {label}
                    </Button>
                </div>
            </div>
        );
    }
);
InlineActionButton.displayName = 'InlineActionButton';
