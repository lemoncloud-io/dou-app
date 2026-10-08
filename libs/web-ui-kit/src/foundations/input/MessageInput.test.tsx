import { fireEvent, render, screen } from '@testing-library/react';

import { MessageInput } from './MessageInput';

describe('MessageInput', () => {
    it('renders the placeholder and the raw value', () => {
        render(<MessageInput value="" onChange={jest.fn()} placeholder="메시지를 입력해 주세요" />);

        expect(screen.getByPlaceholderText('메시지를 입력해 주세요')).toBeInTheDocument();
    });

    it('emits the raw string on change', () => {
        const onChange = jest.fn();
        render(<MessageInput value="" onChange={onChange} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });

        expect(onChange).toHaveBeenCalledWith('hello');
    });

    it('keeps send idle and does not fire onSend when value is blank', () => {
        const onSend = jest.fn();
        render(<MessageInput value="   " onChange={jest.fn()} onSend={onSend} />);

        const send = screen.getByRole('button', { name: 'Send' });
        expect(send).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(send);
        expect(onSend).not.toHaveBeenCalled();
    });

    // The idle send button must stay a live pointer target: a `disabled` control receives no
    // pointer events (nor lets them bubble), so the keep-the-keyboard preventDefault would be
    // skipped and tapping send right after a message went out would blur the textarea.
    it('prevents the default on pointer down over the idle send button', () => {
        render(<MessageInput value="" onChange={jest.fn()} onSend={jest.fn()} />);

        const send = screen.getByRole('button', { name: 'Send' });
        expect(send).toBeEnabled();

        const prevented = !fireEvent.pointerDown(send);
        expect(prevented).toBe(true);
    });

    it('enables send and fires onSend with the value when there is trimmed text', () => {
        const onSend = jest.fn();
        render(<MessageInput value="hi" onChange={jest.fn()} onSend={onSend} />);

        const send = screen.getByRole('button', { name: 'Send' });
        expect(send).toBeEnabled();

        fireEvent.click(send);
        expect(onSend).toHaveBeenCalledWith('hi');
    });

    it('keeps the caret on the textarea when pointer down lands on the textarea itself', () => {
        render(<MessageInput value="hi" onChange={jest.fn()} onSend={jest.fn()} />);

        const prevented = !fireEvent.pointerDown(screen.getByRole('textbox'));
        expect(prevented).toBe(false);
    });

    // iOS WKWebView moves focus as the `mousedown` default action, so cancelling `pointerdown`
    // alone does not hold the caret there.
    it('prevents the default on mouse down over the send button but not over the textarea', () => {
        render(<MessageInput value="hi" onChange={jest.fn()} onSend={jest.fn()} />);

        expect(!fireEvent.mouseDown(screen.getByRole('button', { name: 'Send' }))).toBe(true);
        expect(!fireEvent.mouseDown(screen.getByRole('textbox'))).toBe(false);
    });

    it('disables input and send when disabled', () => {
        render(<MessageInput value="hi" onChange={jest.fn()} disabled />);

        expect(screen.getByRole('textbox')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });

    // Photos picked in the attach panel go with or without a caption.
    describe('with something besides text to send', () => {
        it('enables send with an empty field and fires onSend with an empty string', () => {
            const onSend = jest.fn();
            render(<MessageInput value="  " onChange={jest.fn()} onSend={onSend} sendReady />);

            const send = screen.getByRole('button', { name: 'Send' });
            expect(send).toHaveAttribute('aria-disabled', 'false');

            fireEvent.click(send);
            expect(onSend).toHaveBeenCalledWith('');
        });

        it('hands over typed text trimmed, as the caption', () => {
            const onSend = jest.fn();
            render(<MessageInput value="  caption " onChange={jest.fn()} onSend={onSend} sendReady />);

            fireEvent.click(screen.getByRole('button', { name: 'Send' }));
            expect(onSend).toHaveBeenCalledWith('caption');
        });

        it('still sends nothing while the composer is disabled', () => {
            const onSend = jest.fn();
            render(<MessageInput value="" onChange={jest.fn()} onSend={onSend} sendReady disabled />);

            fireEvent.click(screen.getByRole('button', { name: 'Send' }));
            expect(onSend).not.toHaveBeenCalled();
        });

        // The border is the field's: lit by text, not by photos waiting beside it.
        it('leaves the field’s border idle while nothing is typed', () => {
            const { container, rerender } = render(<MessageInput value="" onChange={jest.fn()} sendReady />);
            expect(container.firstChild).toHaveClass('border-input-border');

            rerender(<MessageInput value="hi" onChange={jest.fn()} sendReady />);
            expect(container.firstChild).toHaveClass('border-focus-border');
        });
    });

    // The attach button lives in the pill (Figma 3749:27998) but the input must not learn what it is.
    it('draws a leading slot before the textarea, and nothing when none is given', () => {
        const { rerender } = render(<MessageInput value="" onChange={jest.fn()} />);
        expect(screen.queryByRole('button', { name: 'Attach' })).not.toBeInTheDocument();

        rerender(<MessageInput value="" onChange={jest.fn()} leadingSlot={<button>Attach</button>} />);
        const slot = screen.getByRole('button', { name: 'Attach' });
        const textarea = screen.getByRole('textbox');
        expect(slot.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});
