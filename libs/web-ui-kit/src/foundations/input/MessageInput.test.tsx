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
});
