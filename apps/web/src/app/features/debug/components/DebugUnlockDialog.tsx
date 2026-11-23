import { useEffect, useState, type FormEvent } from 'react';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { TextField } from '@chatic/web-ui-kit';

import { useDebugSharedStrings } from '../i18n/screens/shared';

interface DebugUnlockDialogProps {
    isOpen: boolean;
    hasError: boolean;
    onSubmit: (code: string) => void;
    onCancel: () => void;
}

export const DebugUnlockDialog = ({ isOpen, hasError, onSubmit, onCancel }: DebugUnlockDialogProps) => {
    const [code, setCode] = useState('');
    const strings = useDebugSharedStrings();

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
            <AlertDialogContent className="gap-4 rounded-[12px] p-6">
                <AlertDialogTitle className="text-center text-[16px] font-semibold text-foreground">
                    {strings.unlockDialog.title}
                </AlertDialogTitle>
                <AlertDialogDescription className="sr-only">{strings.unlockDialog.description}</AlertDialogDescription>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <TextField
                        className="px-0"
                        value={code}
                        onChange={setCode}
                        error={hasError ? strings.unlockDialog.wrongCode : undefined}
                        placeholder={strings.unlockDialog.placeholder}
                        autoFocus
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-label={strings.unlockDialog.ariaLabel}
                    />
                    <Button type="submit" disabled={!code.trim()}>
                        {strings.unlockDialog.unlock}
                    </Button>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    );
};
