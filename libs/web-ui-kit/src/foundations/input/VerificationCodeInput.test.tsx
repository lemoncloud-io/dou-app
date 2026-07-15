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
