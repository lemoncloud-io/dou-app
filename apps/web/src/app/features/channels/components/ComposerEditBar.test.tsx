import '@testing-library/jest-dom';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ComposerEditBar, type ComposerEditState } from './ComposerEditBar';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/ui-kit', () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }));

const edit = (overrides: Partial<ComposerEditState> = {}): ComposerEditState => ({
    targetId: 'ch-1:4',
    original: '원래 메시지',
    draft: '원래 메시지',
    onDraftChange: jest.fn(),
    isSaving: false,
    hasFailed: false,
    onSave: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
});

// The field the bar steers is the composer's own, rendered by the page; a plain textarea stands in.
const renderWithField = (state: ComposerEditState, value = state.draft) => {
    const inputRef = createRef<HTMLTextAreaElement>();
    const view = render(
        <>
            <ComposerEditBar edit={state} inputRef={inputRef} />
            <textarea ref={inputRef} defaultValue={value} data-testid="field" />
        </>
    );
    return { ...view, inputRef };
};

describe('ComposerEditBar', () => {
    it('quotes the message being edited so you can tell which one it is', () => {
        renderWithField(edit());

        const bar = screen.getByTestId('composer-edit-bar');
        expect(bar).toHaveTextContent('chat.room.editMessage');
        expect(bar).toHaveTextContent('원래 메시지');
    });

    // The draft is still in the field and the send button is live, so the bar says it can be retried.
    it('shows the failure in place of the quote after a rejected save', () => {
        renderWithField(edit({ hasFailed: true }));

        const bar = screen.getByTestId('composer-edit-bar');
        expect(bar).toHaveTextContent('chat.room.editFailed');
        expect(bar).not.toHaveTextContent('원래 메시지');
    });

    it('cancels through the parent, which decides whether to confirm', () => {
        const state = edit();
        renderWithField(state);

        fireEvent.click(screen.getByRole('button', { name: 'chat.room.editCancel' }));

        expect(state.onCancel).toHaveBeenCalledTimes(1);
    });

    // Cancelling mid-save would leave the save landing on a closed edit.
    it('does not offer cancel while the save is in flight', () => {
        renderWithField(edit({ isSaving: true }));

        expect(screen.getByRole('button', { name: 'chat.room.editCancel' })).toBeDisabled();
    });

    // Selecting the whole body would let the first keystroke destroy it.
    it('puts the caret at the end of the field when the edit opens', () => {
        renderWithField(edit(), 'abc');

        const field = screen.getByTestId('field') as HTMLTextAreaElement;
        expect(document.activeElement).toBe(field);
        expect(field.selectionStart).toBe(3);
        expect(field.selectionEnd).toBe(3);
    });

    it('moves the caret again when another message is picked for editing', () => {
        const { rerender, inputRef } = renderWithField(edit(), 'abc');
        const field = screen.getByTestId('field') as HTMLTextAreaElement;
        field.blur();
        field.setSelectionRange(0, 0);

        rerender(
            <>
                <ComposerEditBar edit={edit({ targetId: 'ch-1:9' })} inputRef={inputRef} />
                <textarea ref={inputRef} defaultValue="abc" data-testid="field" />
            </>
        );

        expect(document.activeElement).toBe(field);
        expect(field.selectionStart).toBe(3);
    });

    it('says the save is in flight in place of the quote', () => {
        renderWithField(edit({ isSaving: true }));

        const bar = screen.getByTestId('composer-edit-bar');
        expect(bar).toHaveTextContent('chat.room.editSaving');
        expect(bar).not.toHaveTextContent('원래 메시지');
    });

    // Disabling the field for the save takes the focus and the keyboard; the retry belongs in the field.
    it('puts the caret back in the field when a save fails', () => {
        const { rerender, inputRef } = renderWithField(edit(), 'abc');
        const field = screen.getByTestId('field') as HTMLTextAreaElement;
        field.blur();

        rerender(
            <>
                <ComposerEditBar edit={edit({ hasFailed: true })} inputRef={inputRef} />
                <textarea ref={inputRef} defaultValue="abc" data-testid="field" />
            </>
        );

        expect(document.activeElement).toBe(field);
        expect(field.selectionStart).toBe(3);
    });

    it('announces the status line to assistive technology', () => {
        renderWithField(edit({ hasFailed: true }));

        expect(screen.getByText('chat.room.editFailed').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    });
});
