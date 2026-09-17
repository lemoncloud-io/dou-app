import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));

import { ConfirmDialog } from './ConfirmDialog';

const baseProps = {
    open: true,
    onOpenChange: jest.fn(),
    title: 'title',
    confirmLabel: 'confirm',
    onConfirm: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('ConfirmDialog — closing on confirm', () => {
    it('closes by itself on confirm, which is what a confirm with no round trip wants', () => {
        const onOpenChange = jest.fn();
        const onConfirm = jest.fn();
        render(<ConfirmDialog {...baseProps} onOpenChange={onOpenChange} onConfirm={onConfirm} />);

        fireEvent.click(screen.getByText('confirm'));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    // The regression this file exists for. `AlertDialogAction` is Radix's `DialogPrimitive.Close`,
    // so the press used to close the dialog before the work it started could report as in flight.
    // A caller driving `isPending` from its own state therefore never got to render the spinner —
    // the message delete looked like nothing had happened for the whole round trip.
    it('stays open on confirm when the caller owns the closing, so a pending state can render', () => {
        const onOpenChange = jest.fn();
        const onConfirm = jest.fn();
        render(
            <ConfirmDialog {...baseProps} onOpenChange={onOpenChange} onConfirm={onConfirm} closeOnConfirm={false} />
        );

        fireEvent.click(screen.getByText('confirm'));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onOpenChange).not.toHaveBeenCalled();
        // Still mounted: with no `description` the title is drawn twice (heading + description
        // fallback), so this counts rather than fetching one.
        expect(screen.getAllByText('title').length).toBeGreaterThan(0);
    });

    it('disables both buttons and swaps the label for a spinner while pending', () => {
        render(<ConfirmDialog {...baseProps} isPending closeOnConfirm={false} />);

        expect(screen.queryByText('confirm')).not.toBeInTheDocument();
        screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled());
    });

    it('refuses to close while pending, so the back gesture cannot drop the dialog mid-request', () => {
        const onOpenChange = jest.fn();
        render(<ConfirmDialog {...baseProps} onOpenChange={onOpenChange} isPending closeOnConfirm={false} />);

        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

        expect(onOpenChange).not.toHaveBeenCalled();
    });
});
