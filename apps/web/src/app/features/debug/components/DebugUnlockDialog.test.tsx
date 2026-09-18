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

    // The old 6-digit pad auto-submitted the instant its length filled. That behavior was removed so the
    // dialog isn't tied to a fixed digit count, so filling 6 characters alone must do nothing.
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

    // If a single trailing space a mobile keyboard appends breaks an exact match, the cause is hard to find.
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

    // Don't let a wrong code be edited in place — make the user enter it fresh (preserves existing behavior).
    it('틀린 시도 뒤에는 입력을 비운다', () => {
        const { rerender, onSubmit } = setup();

        fireEvent.change(field(), { target: { value: 'wrong' } });
        rerender(<DebugUnlockDialog isOpen hasError onSubmit={onSubmit} onCancel={jest.fn()} />);

        expect(field()).toHaveValue('');
        expect(screen.getByText('Wrong code')).toBeInTheDocument();
    });
});
