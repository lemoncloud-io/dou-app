import * as React from 'react';

import { cn } from '@chatic/ui-kit';

const VARIANT = {
    title: 'text-[21px] font-semibold leading-[1.35] tracking-[-0.025em]',
    heading: 'text-[18px] font-semibold leading-[25px] tracking-[-0.09px]',
    body: 'text-[16px] font-medium leading-[1.45] tracking-[-0.08px]',
    callout: 'text-[15px] leading-[1.4] tracking-[-0.075px]',
    caption: 'text-[13px] leading-4 tracking-[-0.065px]',
    label: 'text-[14px] font-semibold leading-[18px] tracking-[0.07px]',
} as const;

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
    variant?: keyof typeof VARIANT;
    as?: React.ElementType;
}

export const Text = ({ variant = 'body', as, className, children, ...props }: TextProps) => {
    const Comp = as ?? 'span';
    return (
        <Comp className={cn(VARIANT[variant], className)} {...props}>
            {children}
        </Comp>
    );
};
