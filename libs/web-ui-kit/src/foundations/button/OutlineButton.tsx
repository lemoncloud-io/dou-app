import * as React from 'react';

import { Button, type ButtonProps } from './Button';

export interface OutlineButtonProps extends Omit<ButtonProps, 'variant'> {}

/**
 * Outline (pill) button preset — a Button locked to the `outline` variant.
 * Defaults to the small badge size; `accent` switches the border to brand green.
 * The base for plan/subscription buttons and inline outline actions.
 */
export const OutlineButton = React.forwardRef<HTMLButtonElement, OutlineButtonProps>(
    ({ size = 'sm', ...props }, ref) => <Button ref={ref} variant="outline" size={size} {...props} />
);
OutlineButton.displayName = 'OutlineButton';
