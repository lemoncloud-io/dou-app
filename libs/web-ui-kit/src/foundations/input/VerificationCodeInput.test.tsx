import { fireEvent, render, screen } from '@testing-library/react';

import { VerificationCodeInput } from './VerificationCodeInput';

describe('VerificationCodeInput', () => {
    it('renders the code digits across cells', () => {
        render(<VerificationCodeInput value="123" onChange={jest.fn()} length={6} ariaLabel="인증번호" />);
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('emits digits-only, capped to length', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} length={4} ariaLabel="인증번호" />);
        fireEvent.change(screen.getByLabelText('인증번호'), { target: { value: '12ab3456' } });
        expect(onChange).toHaveBeenCalledWith('1234');
    });
});

describe('VerificationCodeInput — allowNonDigits', () => {
    // 운영 필드가 조용히 넓어지지 않도록, 기본값은 숫자 전용이다.
    it('기본값은 숫자만 통과시킨다', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} length={6} ariaLabel="인증번호" />);

        fireEvent.change(screen.getByLabelText('인증번호'), { target: { value: '1#2' } });

        expect(onChange).toHaveBeenCalledWith('12');
    });

    it('켜면 비숫자 문자도 통과시킨다 (개발 서버의 bypass 코드)', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} length={6} ariaLabel="인증번호" allowNonDigits />);

        fireEvent.change(screen.getByLabelText('인증번호'), { target: { value: '#' } });

        expect(onChange).toHaveBeenCalledWith('#');
    });

    it('켜져 있어도 공백은 버리고 길이 상한은 지킨다', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} length={3} ariaLabel="인증번호" allowNonDigits />);

        fireEvent.change(screen.getByLabelText('인증번호'), { target: { value: ' #a b12' } });

        expect(onChange).toHaveBeenCalledWith('#ab');
    });

    // 숫자 키패드에는 '#'이 없다 — 필터만 풀고 키패드를 그대로 두면 폰에서 입력 자체가 불가능하다.
    it('켜면 숫자 키패드를 쓰지 않는다', () => {
        const { rerender } = render(<VerificationCodeInput value="" onChange={jest.fn()} ariaLabel="인증번호" />);
        expect(screen.getByLabelText('인증번호')).toHaveAttribute('inputmode', 'numeric');

        rerender(<VerificationCodeInput value="" onChange={jest.fn()} ariaLabel="인증번호" allowNonDigits />);
        expect(screen.getByLabelText('인증번호')).toHaveAttribute('inputmode', 'text');
    });
});
