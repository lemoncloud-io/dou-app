import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import { Label } from '@chatic/ui-kit/components/ui/label';

/**
 * One labelled form control with its error, wired the way the invite dialog
 * does: the field carries `aria-invalid` and points at the error node, so the
 * failure is announced with the field instead of floating beside it.
 *
 * The error node itself is a separate `FormError`, so one failure can be
 * shared by two fields (the report dialog's title and body send together).
 */
export const FormField = ({
    label,
    htmlFor,
    errorId,
    invalid,
    children,
}: {
    label: string;
    htmlFor: string;
    /** The `FormError` node id this field points at while invalid. */
    errorId?: string;
    invalid?: boolean;
    /** Exactly one control (Input, Textarea). */
    children: ReactNode;
}) => {
    const child = Children.only(children);
    // A control's own description survives: the error is appended to it, so a
    // hint the field already named is not dropped by the failure.
    const wired =
        invalid && isValidElement(child)
            ? cloneElement(child as ReactElement<Record<string, unknown>>, {
                  'aria-invalid': true,
                  ...(errorId
                      ? {
                            'aria-describedby': [(child.props as Record<string, unknown>)['aria-describedby'], errorId]
                                .filter(Boolean)
                                .join(' '),
                        }
                      : {}),
              })
            : child;

    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={htmlFor}>{label}</Label>
            {wired}
        </div>
    );
};

export const FormError = ({ id, children }: { id: string; children: ReactNode }) => (
    <p id={id} role="alert" className="text-callout text-destructive break-words">
        {children}
    </p>
);
