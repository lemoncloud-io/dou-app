import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { DebugUnlockDialog } from './DebugUnlockDialog';

const setup = (over: Partial<React.ComponentProps<typeof DebugUnlockDialog>> = {}) => {
    const onSubmit = jest.fn();
    const onCancel = jest.fn();
    const view = render(
        <DebugUnlockDialog isOpen hasError={false} onSubmit={onSubmit} onCancel={onCancel} {...over} />
    );
    return { onSubmit, onCancel, ...view };
};

const field = () => screen.getByLabelText('debug entry code');

describe('DebugUnlockDialog — 입력 필드 방식의 코드 확인', () => {
    it('입력한 코드를 확인 버튼으로 제출한다', () => {
        const { onSubmit } = setup();

        fireEvent.change(field(), { target: { value: 'secret1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

        expect(onSubmit).toHaveBeenCalledWith('secret1');
    });

    // 예전 6자리 패드는 길이가 차는 순간 스스로 제출했다. 자리수에 묶이지 않으려고 그 동작을 걷었으므로,
    // 6자를 채우는 것만으로는 아무 일도 일어나지 않아야 한다.
    it('길이가 찼다고 저절로 제출하지 않는다', () => {
        const { onSubmit } = setup();

        fireEvent.change(field(), { target: { value: '123456' } });

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('엔터로도 제출된다', () => {
        const { onSubmit } = setup();

        fireEvent.change(field(), { target: { value: 'secret1' } });
        fireEvent.submit(field().closest('form')!);

        expect(onSubmit).toHaveBeenCalledWith('secret1');
    });

    // 모바일 키보드가 붙이는 뒤 공백 하나로 정확 일치가 깨지면 원인을 찾기 어렵다.
    it('앞뒤 공백은 잘라서 제출한다', () => {
        const { onSubmit } = setup();

        fireEvent.change(field(), { target: { value: '  secret1 ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

        expect(onSubmit).toHaveBeenCalledWith('secret1');
    });

    it('빈 입력은 제출하지 않는다', () => {
        const { onSubmit } = setup();

        fireEvent.change(field(), { target: { value: '   ' } });
        fireEvent.submit(field().closest('form')!);

        expect(onSubmit).not.toHaveBeenCalled();
    });

    // 틀린 코드를 고쳐 쓰게 두지 않고 새로 입력받는다 (기존 동작 유지).
    it('틀린 시도 뒤에는 입력을 비운다', () => {
        const { rerender, onSubmit } = setup();

        fireEvent.change(field(), { target: { value: 'wrong' } });
        rerender(<DebugUnlockDialog isOpen hasError onSubmit={onSubmit} onCancel={jest.fn()} />);

        expect(field()).toHaveValue('');
        expect(screen.getByText('Wrong code')).toBeInTheDocument();
    });
});
