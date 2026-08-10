import { fireEvent, render, screen } from '@testing-library/react';

import { Textarea } from './Textarea';

describe('Textarea', () => {
    it('associates the label with the field and marks it required', () => {
        render(<Textarea label="소중한 의견을 남겨주세요" required value="" onChange={jest.fn()} />);

        const field = screen.getByLabelText(/소중한 의견을 남겨주세요/);
        expect(field).toBeRequired();
        expect(field).toHaveAttribute('aria-required', 'true');
    });

    it('emits the raw string on change', () => {
        const onChange = jest.fn();
        render(<Textarea label="내용" value="" onChange={onChange} />);

        fireEvent.change(screen.getByLabelText('내용'), { target: { value: '이모지 🙂 포함' } });

        expect(onChange).toHaveBeenCalledWith('이모지 🙂 포함');
    });

    it('shows the error text and flags the field invalid, overriding the description', () => {
        render(
            <Textarea label="내용" value="" onChange={jest.fn()} description="도움말" error="내용을 입력해 주세요." />
        );

        expect(screen.getByText('내용을 입력해 주세요.')).toBeInTheDocument();
        expect(screen.queryByText('도움말')).not.toBeInTheDocument();
        expect(screen.getByLabelText('내용')).toHaveAttribute('aria-invalid', 'true');
    });

    // The counter is TextField's behaviour, not this one's — long-form input should not
    // display a visible cap. A caller that needs a hard cap clamps in `onChange`.
    it('never renders a character counter', () => {
        render(<Textarea label="내용" value="1234" onChange={jest.fn()} maxLength={10} />);

        expect(screen.queryByText('4/10')).not.toBeInTheDocument();
    });

    it('honours a custom box height', () => {
        const { container } = render(<Textarea label="내용" value="" onChange={jest.fn()} height={120} />);

        expect(container.querySelector('[style*="height"]')).toHaveStyle({ height: '120px' });
    });
});
