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

    it('keeps send disabled and does not fire onSend when value is blank', () => {
        const onSend = jest.fn();
        render(<MessageInput value="   " onChange={jest.fn()} onSend={onSend} />);

        const send = screen.getByRole('button', { name: 'Send' });
        expect(send).toBeDisabled();

        fireEvent.click(send);
        expect(onSend).not.toHaveBeenCalled();
    });

    it('enables send and fires onSend with the value when there is trimmed text', () => {
        const onSend = jest.fn();
        render(<MessageInput value="hi" onChange={jest.fn()} onSend={onSend} />);

        const send = screen.getByRole('button', { name: 'Send' });
        expect(send).toBeEnabled();

        fireEvent.click(send);
        expect(onSend).toHaveBeenCalledWith('hi');
    });

    it('disables input and send when disabled', () => {
        render(<MessageInput value="hi" onChange={jest.fn()} disabled />);

        expect(screen.getByRole('textbox')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    });
});
