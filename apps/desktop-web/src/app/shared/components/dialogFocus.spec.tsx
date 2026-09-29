import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

/**
 * The kit's dialogs as this app opens them: from state, with no Trigger. Radix hands focus
 * back to the Trigger on close, so these used to drop it on <body>.
 */
const StateDialog = ({ withField = false }: { withField?: boolean }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                open
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent closeLabel="Close">
                    <DialogTitle>Title</DialogTitle>
                    <DialogDescription>Body</DialogDescription>
                    {withField && <input aria-label="field" autoFocus />}
                </DialogContent>
            </Dialog>
        </>
    );
};

const Notice = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                open
            </button>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <AlertDialogTitle>Title</AlertDialogTitle>
                    <AlertDialogDescription>Body</AlertDialogDescription>
                    <AlertDialogAction onClick={() => setOpen(false)}>OK</AlertDialogAction>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

describe('kit dialogs opened without a Trigger', () => {
    afterEach(cleanup);

    it('return focus to the control that opened them', async () => {
        render(<StateDialog />);
        const opener = screen.getByRole('button', { name: 'open' });
        opener.focus();
        fireEvent.click(opener);
        await flush();
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await flush();
        expect(document.activeElement).toBe(opener);
    });

    // The quick switcher's field takes focus as it mounts, and React's development double-mount
    // then ran the capture again: the field was taken for the opener and focus fell to <body>.
    it('return focus past a field that focused itself, under StrictMode', async () => {
        render(
            <StrictMode>
                <StateDialog withField />
            </StrictMode>
        );
        const opener = screen.getByRole('button', { name: 'open' });
        opener.focus();
        fireEvent.click(opener);
        await flush();
        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'field' }));
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await flush();
        expect(document.activeElement).toBe(opener);
    });

    // An alert dialog focuses its Cancel. With an action only, it focused nothing and
    // Enter still went to the page behind the notice.
    it('focus the only action of a notice, then return focus on close', async () => {
        render(<Notice />);
        const opener = screen.getByRole('button', { name: 'open' });
        opener.focus();
        fireEvent.click(opener);
        await flush();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'OK' }));
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await flush();
        expect(document.activeElement).toBe(opener);
    });

    it('leave focus where the caller put it on close', async () => {
        render(
            <>
                <StateDialog />
                <button type="button">elsewhere</button>
            </>
        );
        const opener = screen.getByRole('button', { name: 'open' });
        const elsewhere = screen.getByRole('button', { name: 'elsewhere' });
        opener.focus();
        fireEvent.click(opener);
        await flush();
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        elsewhere.focus();
        await flush();
        expect(document.activeElement).toBe(elsewhere);
    });

    // On a phone, focusing the text field that opened a sheet raises the keyboard again.
    it('do not refocus a text field on a touch screen', async () => {
        // jsdom ships no matchMedia; stand in a touch screen's.
        window.matchMedia = vi.fn((query: string) => ({ matches: query === '(pointer: coarse)' }) as MediaQueryList);
        try {
            render(
                <>
                    <input aria-label="message" />
                    <StateDialog />
                </>
            );
            const field = screen.getByRole('textbox', { name: 'message' });
            field.focus();
            fireEvent.click(screen.getByRole('button', { name: 'open' }));
            await flush();
            fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
            await flush();
            expect(document.activeElement).not.toBe(field);
        } finally {
            Reflect.deleteProperty(window, 'matchMedia');
        }
    });
});
