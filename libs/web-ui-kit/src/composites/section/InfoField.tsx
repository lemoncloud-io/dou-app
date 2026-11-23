import type { ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

import { Text } from '../../foundations/text';

export interface InfoFieldProps {
    label: string;
    children: ReactNode;
    className?: string;
}

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
