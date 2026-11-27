import { fireEvent, render, screen, within } from '@testing-library/react';

import { AudioSendSheet } from './AudioSendSheet';

const items = [
    { key: 'a', name: 'Recording 8.m4a', meta: '35:47 · 17.0MB' },
    { key: 'b', name: 'Team meeting 1107.m4a', meta: '1:12:05 · 68.4MB' },
];

const props = { open: true, onOpenChange: jest.fn(), onRemove: jest.fn(), onCancel: jest.fn(), onSend: jest.fn() };

describe('AudioSendSheet', () => {
    it('lists each file with its meta line', () => {
        render(<AudioSendSheet {...props} items={items} />);
        const rows = within(screen.getByRole('list')).getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Recording 8.m4a');
        expect(rows[1]).toHaveTextContent('1:12:05 · 68.4MB');
    });

    it('removes a row by its key, naming the file on the button', () => {
        const onRemove = jest.fn();
        render(<AudioSendSheet {...props} items={items} onRemove={onRemove} />);
        fireEvent.click(screen.getByRole('button', { name: 'Remove Team meeting 1107.m4a' }));
        expect(onRemove).toHaveBeenCalledWith('b');
    });

    it('cancels and sends', () => {
        const onCancel = jest.fn();
        const onSend = jest.fn();
        render(<AudioSendSheet {...props} items={items} onCancel={onCancel} onSend={onSend} sendLabel="Send 2" />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Send 2' }));
        expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('cannot send an empty list, and leaves closing it to the host', () => {
        const onOpenChange = jest.fn();
        render(<AudioSendSheet {...props} items={[]} onOpenChange={onOpenChange} />);
        expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('is named by its title and takes its labels from the host', () => {
        render(
            <AudioSendSheet
                {...props}
                items={items}
                title="음성 파일 2개 보내기"
                cancelLabel="취소"
                sendLabel="2개 보내기"
                removeLabel={name => `${name} 빼기`}
            />
        );
        expect(screen.getByRole('dialog', { name: '음성 파일 2개 보내기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '2개 보내기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Recording 8.m4a 빼기' })).toBeInTheDocument();
    });

    it('draws nothing while closed', () => {
        render(<AudioSendSheet {...props} open={false} items={items} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
