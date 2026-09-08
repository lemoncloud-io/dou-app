import { describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';

import { PayloadPane } from './PayloadPane';
import { blocksToPayloadJson } from './payloadCodec';

const VALID = blocksToPayloadJson([{ type: 'divider' }]);

const setup = () => {
    const onBlocks = vi.fn();
    const onError = vi.fn();
    render(<PayloadPane json={VALID} onBlocks={onBlocks} onError={onError} />);
    return { onBlocks, onError, editor: screen.getByLabelText('Payload JSON') as HTMLTextAreaElement };
};

describe('PayloadPane', () => {
    it('shows the payload the current blocks compile to', () => {
        const { editor } = setup();
        expect(editor.value).toBe(VALID);
    });

    it('hands back the blocks of a payload that parses', () => {
        const { onBlocks, editor } = setup();
        fireEvent.change(editor, {
            target: { value: '{"blocks":[{"type":"header","text":{"type":"plain_text","text":"Hi"}}]}' },
        });
        expect(onBlocks).toHaveBeenCalledWith([
            { type: 'header', text: { type: 'plain_text', text: 'Hi' }, level: undefined },
        ]);
    });

    // Half of every paste is a half-typed brace. Clearing the preview there would
    // destroy the message the reader is in the middle of checking.
    it('keeps the last valid payload and reports the problem when the JSON is broken', () => {
        const { onBlocks, onError, editor } = setup();
        fireEvent.change(editor, { target: { value: '{"blocks":[' } });
        expect(onBlocks).not.toHaveBeenCalled();
        expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }));
    });

    // The preview says what went wrong; this pane says where. Without the marker
    // the reader is handed a line number to count out by hand.
    it('marks the line the parser blamed', () => {
        const { editor } = setup();
        fireEvent.change(editor, { target: { value: '{\n  "blocks": [\n    {,}\n  ]\n}' } });
        expect(screen.getByLabelText('Payload line 3 failed to parse')).not.toBeNull();
    });

    it('clears the error once the payload parses again', () => {
        const { onError, editor } = setup();
        fireEvent.change(editor, { target: { value: '{' } });
        expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false }));
        fireEvent.change(editor, { target: { value: VALID } });
        expect(onError).toHaveBeenLastCalledWith(null);
    });

    // Typing changes the blocks, which changes `json`, which must not be mistaken
    // for an outside edit and reformatted under the caret.
    it('does not overwrite what the reader typed with the reformatted payload', () => {
        const { editor } = setup();
        const typed = '{"blocks":[{"type":"divider"}]}';
        fireEvent.change(editor, { target: { value: typed } });
        expect(editor.value).toBe(typed);
    });
});
