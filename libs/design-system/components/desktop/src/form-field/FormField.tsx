import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

import { Label } from '@chatic/ui-kit';

export const FormField = ({
    label,
    htmlFor,
    errorId,
    invalid,
    children,
}: {
    label: string;
    htmlFor: string;
    errorId?: string;
    invalid?: boolean;
    children: ReactNode;
}) => {
    const child = Children.only(children);
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
