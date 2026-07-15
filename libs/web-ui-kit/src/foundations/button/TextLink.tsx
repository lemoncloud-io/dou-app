import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconChevronRight } from '../../resources/icons';

export interface TextLinkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Appends a trailing chevron (the "2ea" style in the design guide). */
    withChevron?: boolean;
    /** When set, renders a real anchor (`<a href>`) for navigation instead of a button. */
    href?: string;
}

const TEXT_LINK_CLASS =
    'inline-flex items-center justify-center gap-0.5 text-[15px] font-medium tracking-[0.075px] text-label transition-colors disabled:opacity-50';

/**
 * Text link button — the design guide's "Text Link / Text Button": a borderless,
 * fill-less text action in the muted label color, optionally with a trailing
 * chevron. Used as the optional sub-action under a floating button, or inline.
 * Renders an anchor when `href` is set (navigation), a button otherwise.
 */
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
