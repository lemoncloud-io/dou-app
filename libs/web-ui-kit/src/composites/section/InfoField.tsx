import type { ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { Text } from '../../foundations/text';

export interface InfoFieldProps {
    /** Muted caption above the value (e.g. "플레이스 만든 날짜"). */
    label: string;
    /**
     * The value. A string renders at the body scale; a node (a member row, a badge) is placed as-is,
     * so the field imposes only the label and the spacing.
     */
    children: ReactNode;
    className?: string;
}

/**
 * Read-only label + value block — Figma's "General Input" (3769:34151), the unit the place-detail
 * screen stacks three of. It looks like a form field but takes no input: the label sits above and the
 * value below at 12px, and the block carries the screen's 16px side padding.
 *
 * Whether a field appears at all is the caller's call. A missing value is not an empty field with a
 * dash — the row is left out, so the screen never states a fact the server did not send.
 */
export const InfoField = ({ label, children, className }: InfoFieldProps) => {
    return (
        <div className={cn('flex w-full flex-col gap-3 px-4', className)}>
            <Text variant="label" className="text-description">
                {label}
            </Text>
            {typeof children === 'string' ? (
                <Text variant="body" className="text-foreground">
                    {children}
                </Text>
            ) : (
                children
            )}
        </div>
    );
};
