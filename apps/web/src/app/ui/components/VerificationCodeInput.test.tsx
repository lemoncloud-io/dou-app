import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

// `buildEnv` reads `import.meta`, which ts-jest's CommonJS transform cannot parse.
let isDevBuildValue = false;
jest.mock('../../utils/buildEnv', () => ({ isDevBuild: () => isDevBuildValue }));
jest.mock('../../utils', () => ({ VERIFICATION_CODE_LENGTH: 6 }));

import { VerificationCodeInput } from './VerificationCodeInput';

const cells = () => screen.getAllByRole('textbox');

beforeEach(() => {
    isDevBuildValue = false;
});

describe('VerificationCodeInput — 운영 빌드', () => {
    it('숫자만 받아들인다', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} />);

        fireEvent.change(cells()[0], { target: { value: '#' } });

        expect(onChange).toHaveBeenCalledWith('');
    });

    it('붙여넣기에서도 비숫자를 걷어낸다', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} />);

        fireEvent.paste(cells()[0], { clipboardData: { getData: () => '12#34' } });

        expect(onChange).toHaveBeenCalledWith('1234');
    });

    // Bringing up the numeric keypad is the normal behavior in production.
    it('숫자 키패드를 쓴다', () => {
        render(<VerificationCodeInput value="" onChange={jest.fn()} />);
        expect(cells()[0]).toHaveAttribute('inputmode', 'numeric');
    });
});

// The dev server accepts a non-numeric bypass code. A digits-only filter was blocking it from ever being entered.
describe('VerificationCodeInput — 개발 빌드', () => {
    beforeEach(() => {
        isDevBuildValue = true;
    });

    it('# 같은 비숫자 문자를 받아들인다', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} />);

        fireEvent.change(cells()[0], { target: { value: '#' } });

        expect(onChange).toHaveBeenCalledWith('#');
    });

    it('붙여넣기도 비숫자를 남긴다', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} />);

        fireEvent.paste(cells()[0], { clipboardData: { getData: () => '#12' } });

        expect(onChange).toHaveBeenCalledWith('#12');
    });

    it('공백은 여전히 버린다', () => {
        const onChange = jest.fn();
        render(<VerificationCodeInput value="" onChange={onChange} />);

        fireEvent.paste(cells()[0], { clipboardData: { getData: () => ' 1 2 ' } });

        expect(onChange).toHaveBeenCalledWith('12');
    });

    // A numeric keypad has no '#' — unblocking only the filter still leaves it untypeable on a phone.
    it('숫자 키패드를 쓰지 않는다', () => {
        render(<VerificationCodeInput value="" onChange={jest.fn()} />);
        expect(cells()[0]).toHaveAttribute('inputmode', 'text');
    });
});
