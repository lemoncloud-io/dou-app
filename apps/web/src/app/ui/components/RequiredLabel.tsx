import type { ComponentPropsWithoutRef } from 'react';

import { Label } from '@chatic/ui-kit/components/ui/label';

/**
 * Form label for a required field — the kit `Label` with a leading red asterisk.
 *
 * The asterisk lives here rather than as a `required` prop on the shared ui-kit Label so this
 * web-only affordance does not change a component every app depends on. Decorative: the asterisk
 * is aria-hidden and the requirement is conveyed by the input's own `required`/`aria-required`.
 */
export const RequiredLabel = ({ children, ...props }: ComponentPropsWithoutRef<typeof Label>) => (
    <Label {...props}>
        <span className="text-destructive" aria-hidden>
            *
        </span>
        {children}
    </Label>
);
