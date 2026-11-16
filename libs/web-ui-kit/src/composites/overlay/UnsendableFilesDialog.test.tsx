import { fireEvent, render, screen } from '@testing-library/react';

import { UnsendableFilesDialog } from './UnsendableFilesDialog';

const ITEMS = [
    { key: 'a', name: 'Workshop full recording.wav', reason: '412MB' },
    { key: 'b', name: 'Board meeting.m4a', reason: '388MB' },
];

describe('UnsendableFilesDialog', () => {
    it('shows the title, the description and every refused file with its reason', () => {
        render(
            <UnsendableFilesDialog
                open
                onOpenChange={jest.fn()}
                items={ITEMS}
                restCount={1}
                description="A file can be up to 300MB."
            />
        );
        expect(screen.getByRole('alertdialog', { name: 'Some files can’t be sent' })).toBeInTheDocument();
        expect(screen.getByText('A file can be up to 300MB.')).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getByText('Workshop full recording.wav')).toBeInTheDocument();
        expect(screen.getByText('412MB')).toHaveClass('text-alert-red');
    });

    it('offers Cancel and "Send the other n" while some files can still go', () => {
        render(<UnsendableFilesDialog open onOpenChange={jest.fn()} items={ITEMS} restCount={3} />);
        expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Cancel', 'Send the other 3']);
    });

    it('sends the rest and closes', () => {
        const onSendRest = jest.fn();
        const onOpenChange = jest.fn();
        render(
            <UnsendableFilesDialog
                open
                onOpenChange={onOpenChange}
                items={ITEMS}
                restCount={1}
                onSendRest={onSendRest}
                sendRestLabel="Send 1 only"
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Send 1 only' }));
        expect(onSendRest).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('cancels without sending', () => {
        const onSendRest = jest.fn();
        const onCancel = jest.fn();
        const onOpenChange = jest.fn();
        render(
            <UnsendableFilesDialog
                open
                onOpenChange={onOpenChange}
                items={ITEMS}
                restCount={1}
                onSendRest={onSendRest}
                onCancel={onCancel}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onSendRest).not.toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('shows a single OK when nothing is left to send', () => {
        const onConfirm = jest.fn();
        const onOpenChange = jest.fn();
        render(
            <UnsendableFilesDialog open onOpenChange={onOpenChange} items={ITEMS} restCount={0} onConfirm={onConfirm} />
        );
        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(1);
        expect(buttons[0]).toHaveTextContent('OK');
        fireEvent.click(buttons[0]);
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('takes translated labels', () => {
        render(
            <UnsendableFilesDialog
                open
                onOpenChange={jest.fn()}
                items={ITEMS}
                restCount={0}
                title="보낼 수 없는 파일이 있습니다"
                confirmLabel="확인"
            />
        );
        expect(screen.getByRole('alertdialog', { name: '보낼 수 없는 파일이 있습니다' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
    });

    it('renders nothing when closed', () => {
        render(<UnsendableFilesDialog open={false} onOpenChange={jest.fn()} items={ITEMS} restCount={1} />);
        expect(screen.queryByText('Workshop full recording.wav')).toBeNull();
    });
});
