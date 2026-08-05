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

    it('drops the hard cap but keeps the counter when enforceMaxLength is false', () => {
        // Over-limit value: counter shows 21/20 (unreachable if the input were hard-capped).
        render(
            <TextField
                label="이름"
                value={'a'.repeat(21)}
                onChange={jest.fn()}
                maxLength={20}
                enforceMaxLength={false}
            />
        );

        expect(screen.getByRole('textbox')).not.toHaveAttribute('maxLength');
        expect(screen.getByText('21/20')).toBeInTheDocument();
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

    it('renders leading before the input and trailing after it', () => {
        const { container } = render(
            <TextField
                label="휴대폰 번호"
                value=""
                onChange={jest.fn()}
                leading={<button type="button">🇰🇷 +82</button>}
                trailing={<button type="button">인증 요청</button>}
            />
        );

        // Order inside the bordered container is what makes it read as one input group.
        const box = container.querySelector('.rounded-\\[10px\\]');
        const order = Array.from(box?.children ?? []).map(child => child.textContent);
        expect(order).toEqual(['🇰🇷 +82', '', '인증 요청']);
    });

    it('omits the leading slot when nothing is passed', () => {
        render(<TextField label="이름" value="" onChange={jest.fn()} />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('lets a focused leading control light the whole field', () => {
        const { container } = render(
            <TextField label="휴대폰 번호" value="" onChange={jest.fn()} leading={<button type="button">🇰🇷</button>} />
        );

        // focus-within, not focus: the ring belongs to the container, so tapping the picker keeps
        // the field looking active instead of dropping it back to its resting border.
        expect(container.querySelector('.rounded-\\[10px\\]')?.className).toContain('focus-within:border-focus-border');
    });

    it('success state greens the description helper', () => {
        render(<TextField label="이름" value="sunny" onChange={jest.fn()} success description="사용 가능해요." />);
        expect(screen.getByText('사용 가능해요.').className).toContain('text-main-accent');
    });
});
