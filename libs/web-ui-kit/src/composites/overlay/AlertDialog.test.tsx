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
                confirmLabel="나가기"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
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
