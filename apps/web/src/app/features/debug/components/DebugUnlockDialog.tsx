import { useEffect, useState, type FormEvent } from 'react';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { TextField } from '@chatic/web-ui-kit';

interface DebugUnlockDialogProps {
    isOpen: boolean;
    hasError: boolean;
    onSubmit: (code: string) => void;
    onCancel: () => void;
}

/**
 * Entry-code challenge shown after the hidden 10-tap unlock. A plain text field rather than a
 * fixed-length digit pad: the pad auto-submitted at its length, which tied the dialog to a code
 * that is exactly that many characters. Submitting is now explicit — the confirm button or Enter.
 *
 * The value is trimmed on submit (a soft keyboard's trailing space would otherwise fail an exact
 * match) but never otherwise transformed: `verifyDebugCode` compares it as typed.
 */
export const DebugUnlockDialog = ({ isOpen, hasError, onSubmit, onCancel }: DebugUnlockDialogProps) => {
    const [code, setCode] = useState('');

    // Clear the input on every close (cancel, wrong-code lockout) and after a wrong
    // attempt so the user re-enters a fresh code rather than editing the rejected one.
    useEffect(() => {
        if (!isOpen || hasError) setCode('');
    }, [isOpen, hasError]);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = code.trim();
        if (trimmed) onSubmit(trimmed);
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
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <TextField
                        value={code}
                        onChange={setCode}
                        error={hasError ? 'Wrong code' : undefined}
                        placeholder="Debug code"
                        autoFocus
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-label="debug entry code"
                    />
                    <Button type="submit" disabled={!code.trim()}>
                        Unlock
                    </Button>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    );
};
