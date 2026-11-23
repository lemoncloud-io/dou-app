import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconChevronRight } from '../../resources/icons';

export interface TextLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    withChevron?: boolean;
    href?: string;
}

const TEXT_LINK_CLASS =
    'inline-flex items-center justify-center gap-0.5 text-[15px] font-medium tracking-[0.075px] text-label transition-colors disabled:opacity-50';

export const TextLink = React.forwardRef<HTMLButtonElement, TextLinkProps>(
    ({ withChevron = false, type = 'button', href, className, children, ...props }, ref) => {
        const content = (
            <>
                {children}
                {withChevron && <IconChevronRight className="size-[18px]" />}
            </>
        );

        if (href) {
            return (
                <a
                    href={href}
                    className={cn(TEXT_LINK_CLASS, className)}
                    {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
                >
                    {content}
                </a>
            );
        }

        return (
            <button ref={ref} type={type} className={cn(TEXT_LINK_CLASS, className)} {...props}>
                {content}
            </button>
        );
    }
);
TextLink.displayName = 'TextLink';
