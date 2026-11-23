import * as React from 'react';

import { Button, type ButtonProps } from './Button';

export interface OutlineButtonProps extends Omit<ButtonProps, 'variant'> {}

export const OutlineButton = React.forwardRef<HTMLButtonElement, OutlineButtonProps>(
    ({ size = 'sm', ...props }, ref) => <Button ref={ref} variant="outline" size={size} {...props} />
);
OutlineButton.displayName = 'OutlineButton';
