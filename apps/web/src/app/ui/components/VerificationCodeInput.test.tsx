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

    // 숫자 키패드를 띄우는 것이 운영에서의 정상 동작이다.
    it('숫자 키패드를 쓴다', () => {
        render(<VerificationCodeInput value="" onChange={jest.fn()} />);
        expect(cells()[0]).toHaveAttribute('inputmode', 'numeric');
    });
});

// 개발 서버는 비숫자 bypass 코드를 인정한다. 숫자 전용 필터가 그걸 아예 입력 못 하게 막고 있었다.
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

    // 숫자 키패드에는 '#'이 없다 — 필터만 풀면 정작 폰에서 못 친다.
    it('숫자 키패드를 쓰지 않는다', () => {
        render(<VerificationCodeInput value="" onChange={jest.fn()} />);
        expect(cells()[0]).toHaveAttribute('inputmode', 'text');
    });
});
