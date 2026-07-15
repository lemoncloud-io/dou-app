import { fireEvent, render, screen } from '@testing-library/react';

import { TextField } from './TextField';

describe('TextField', () => {
    it('renders the label with a required marker', () => {
        render(<TextField label="이름" required value="" onChange={jest.fn()} />);

        expect(screen.getByText('이름')).toBeInTheDocument();
        expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('shows the character counter against maxLength', () => {
        render(<TextField label="이름" value="sunny" onChange={jest.fn()} maxLength={20} />);

        expect(screen.getByText('5/20')).toBeInTheDocument();
    });

    it('omits the counter when maxLength is not set', () => {
        render(<TextField label="이름" value="sunny" onChange={jest.fn()} />);

        expect(screen.queryByText(/\/\d+$/)).not.toBeInTheDocument();
    });

    it('emits the raw string on change', () => {
        const onChange = jest.fn();
        render(<TextField label="이름" value="" onChange={onChange} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi' } });

        expect(onChange).toHaveBeenCalledWith('hi');
    });

    it('caps input length via maxLength attribute', () => {
        render(<TextField label="이름" value="" onChange={jest.fn()} maxLength={20} />);

        expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '20');
    });

    it('renders the error instead of the description', () => {
        render(
            <TextField
                label="이름"
                value=""
                onChange={jest.fn()}
                description="20글자 이내로 입력해 주세요."
                error="이름을 입력해 주세요."
            />
        );

        expect(screen.getByText('이름을 입력해 주세요.')).toBeInTheDocument();
        expect(screen.queryByText('20글자 이내로 입력해 주세요.')).not.toBeInTheDocument();
    });

    it('success state greens the description helper', () => {
        render(<TextField label="이름" value="sunny" onChange={jest.fn()} success description="사용 가능해요." />);
        expect(screen.getByText('사용 가능해요.').className).toContain('text-main-accent');
    });
});
