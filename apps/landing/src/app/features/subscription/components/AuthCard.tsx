import { type HTMLAttributes, type JSX } from 'react';

import { cn } from '../utils';

/**
 * The one column a sign-in step sits in: from `md` a bordered card centred under the bar, on a phone
 * the bare page — the card's border and padding fall away and the content runs the page's width.
 */
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
