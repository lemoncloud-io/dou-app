import { fireEvent, render, screen } from '@testing-library/react';

import { AlertDialog } from './AlertDialog';

describe('AlertDialog', () => {
    it('renders title and description when open', () => {
        render(
            <AlertDialog
                open
                onOpenChange={jest.fn()}
                title="1:1 대화방을 나가시겠습니까?"
                description="방을 나가면 더 이상 대화에 참여할 수 없습니다."
                confirmLabel="나가기"
                onConfirm={jest.fn()}
            />
        );

        expect(screen.getByText('1:1 대화방을 나가시겠습니까?')).toBeInTheDocument();
        expect(screen.getByText('방을 나가면 더 이상 대화에 참여할 수 없습니다.')).toBeInTheDocument();
    });

    it('confirms: fires onConfirm and closes', () => {
        const onConfirm = jest.fn();
        const onOpenChange = jest.fn();
        render(<AlertDialog open onOpenChange={onOpenChange} title="t" confirmLabel="나가기" onConfirm={onConfirm} />);

        fireEvent.click(screen.getByRole('button', { name: '나가기' }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('cancels: fires onCancel and closes without confirming', () => {
        const onConfirm = jest.fn();
        const onCancel = jest.fn();
        const onOpenChange = jest.fn();
        render(
            <AlertDialog
                open
                onOpenChange={onOpenChange}
                title="t"
                cancelLabel="취소"
                confirmLabel="나가기"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '취소' }));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('single action: without cancelLabel renders only the confirm button', () => {
        const onConfirm = jest.fn();
        render(
            <AlertDialog
                open
                onOpenChange={jest.fn()}
                title="초대 링크가 만료되었어요"
                confirmLabel="확인"
                onConfirm={onConfirm}
            />
        );

        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(1);
        expect(buttons[0]).toHaveTextContent('확인');
        fireEvent.click(buttons[0]);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('applies destructive color to the confirm action', () => {
        render(
            <AlertDialog
                open
                onOpenChange={jest.fn()}
                title="t"
                confirmLabel="나가기"
                onConfirm={jest.fn()}
                destructive
            />
        );

        expect(screen.getByRole('button', { name: '나가기' }).className).toContain('text-destructive');
    });

    it('renders nothing when closed', () => {
        render(
            <AlertDialog open={false} onOpenChange={jest.fn()} title="hidden" confirmLabel="ok" onConfirm={jest.fn()} />
        );

        expect(screen.queryByText('hidden')).not.toBeInTheDocument();
    });
});
