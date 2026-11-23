import { type HTMLAttributes, type JSX } from 'react';

import { cn } from '../utils';

export const AuthCard = ({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element => (
    <div className="flex justify-center md:pt-6">
        <div
            className={cn(
                'flex w-full max-w-[440px] flex-col gap-5 md:rounded-2xl md:border md:border-line md:bg-card md:p-10',
                className
            )}
            {...props}
        />
    </div>
);
