import { useEffect, useState } from 'react';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { VerificationCodeInput } from '@chatic/web-ui-kit';

import { DEBUG_CODE_LENGTH } from '../consts';

interface DebugUnlockDialogProps {
    isOpen: boolean;
    hasError: boolean;
    onSubmit: (code: string) => void;
    onCancel: () => void;
}

/**
 * Entry-code challenge shown after the hidden 10-tap unlock. Auto-submits once
 * `DEBUG_CODE_LENGTH` digits are entered — no separate confirm button.
 */
export const DebugUnlockDialog = ({ isOpen, hasError, onSubmit, onCancel }: DebugUnlockDialogProps) => {
    const [code, setCode] = useState('');

    // Clear the input on every close (cancel, wrong-code lockout) and after a wrong
    // attempt so the user re-enters a fresh code rather than editing the rejected one.
    useEffect(() => {
        if (!isOpen || hasError) setCode('');
    }, [isOpen, hasError]);

    const handleChange = (value: string) => {
        setCode(value);
        if (value.length === DEBUG_CODE_LENGTH) onSubmit(value);
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) onCancel();
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
            <AlertDialogContent className="max-w-[288px] gap-4 rounded-[12px] p-6">
                <AlertDialogTitle className="text-center text-[16px] font-semibold text-foreground">
                    Enter Debug Code
                </AlertDialogTitle>
                <AlertDialogDescription className="sr-only">
                    Enter the debug entry code to unlock debug tools.
                </AlertDialogDescription>
                <VerificationCodeInput
                    value={code}
                    onChange={handleChange}
                    length={DEBUG_CODE_LENGTH}
                    error={hasError}
                    autoFocus
                    ariaLabel="debug entry code"
                />
            </AlertDialogContent>
        </AlertDialog>
    );
};
