import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));

const shareFile = jest.fn();
const mockDownloadFile = jest.fn();
jest.mock('../hooks/useFileDownloads', () => ({
    useFileDownloads: () => ({
        share: (file: unknown) => shareFile(file),
        download: (file: unknown) => mockDownloadFile(file),
    }),
}));

import { MessageActionSheet } from './MessageActionSheet';
import { shellCapabilities } from '../../../bridge/shellCapabilities';
import { useRecentEmojiStore, QUICK_REACTIONS } from '../stores/useRecentEmojiStore';

const baseProps = {
    open: true,
    onOpenChange: jest.fn(),
    canReact: true,
    canReply: true,
    canModify: false,
    hasText: true,
    isCopying: false,
    onPickEmoji: jest.fn(),
    onMoreEmoji: jest.fn(),
    onCopy: jest.fn(),
    onReply: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
};

beforeEach(() => {
    jest.clearAllMocks();
    useRecentEmojiStore.setState({ recent: [] });
});

describe('MessageActionSheet — 메시지 롱프레스 액션 시트', () => {
    it('퀵 리액션 줄(6개) + 더보기 + 복사 + 답글을 보여준다', () => {
        render(<MessageActionSheet {...baseProps} />);

        for (const emoji of QUICK_REACTIONS) {
            expect(screen.getByText(emoji)).toBeInTheDocument();
        }
        expect(screen.getByLabelText('chat.room.moreEmoji')).toBeInTheDocument();
        expect(screen.getByText('chat.room.copyMessage')).toBeInTheDocument();
        expect(screen.getByText('chat.thread.replyAction')).toBeInTheDocument();
    });

    it('최근 사용 이모지가 퀵 줄 맨 앞에 온다', () => {
        useRecentEmojiStore.setState({ recent: ['🎉'] });
        render(<MessageActionSheet {...baseProps} />);

        const pressables = screen.getAllByRole('button', { pressed: false });
        const emojiButtons = pressables.filter(b => b.getAttribute('aria-label')?.startsWith('chat.room.reactWith'));
        expect(emojiButtons[0]).toHaveTextContent('🎉');
    });

    it('이모지를 탭하면 onPickEmoji가 그 이모지로 불린다', () => {
        render(<MessageActionSheet {...baseProps} />);
        fireEvent.click(screen.getByText('👍'));
        expect(baseProps.onPickEmoji).toHaveBeenCalledWith('👍');
    });

    it('canReact/canReply가 꺼지면 리액션 줄과 답글 항목이 사라진다', () => {
        render(<MessageActionSheet {...baseProps} canReact={false} canReply={false} />);

        expect(screen.queryByLabelText('chat.room.moreEmoji')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.thread.replyAction')).not.toBeInTheDocument();
        expect(screen.getByText('chat.room.copyMessage')).toBeInTheDocument();
    });

    it('절반 높이 고정을 버리고 내용 높이로 열린다', () => {
        render(<MessageActionSheet {...baseProps} />);

        const dialog = screen.getByRole('dialog');
        expect(dialog).not.toHaveClass('h-[50vh]');
        expect(dialog).toHaveClass('rounded-t-[32px]');
    });

    it('제목 바를 그리지 않지만 접근성 이름은 남긴다', () => {
        render(<MessageActionSheet {...baseProps} />);

        expect(screen.getByText('chat.room.messageActions')).toHaveClass('sr-only');
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('스레드 항목이 메시지 복사보다 위에 온다', () => {
        render(<MessageActionSheet {...baseProps} />);

        const thread = screen.getByText('chat.thread.replyAction');
        const copy = screen.getByText('chat.room.copyMessage');
        expect(thread.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('복사/답글 항목이 각각의 핸들러를 부른다', () => {
        render(<MessageActionSheet {...baseProps} />);
        fireEvent.click(screen.getByText('chat.room.copyMessage'));
        fireEvent.click(screen.getByText('chat.thread.replyAction'));
        expect(baseProps.onCopy).toHaveBeenCalled();
        expect(baseProps.onReply).toHaveBeenCalled();
    });

    it('canModify가 아니면 수정·삭제를 내지 않는다', () => {
        render(<MessageActionSheet {...baseProps} />);

        expect(screen.queryByText('chat.room.editMessage')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.room.deleteMessage')).not.toBeInTheDocument();
    });

    it('canModify면 수정·삭제를 기존 두 항목 아래에 붙인다', () => {
        render(<MessageActionSheet {...baseProps} canModify />);

        const labels = screen
            .getAllByText(/^chat\.(room|thread)\.(replyAction|copyMessage|editMessage|deleteMessage)$/)
            .map(node => node.textContent);
        expect(labels).toEqual([
            'chat.thread.replyAction',
            'chat.room.copyMessage',
            'chat.room.editMessage',
            'chat.room.deleteMessage',
        ]);
    });

    it('수정·삭제를 누르면 각각의 핸들러를 부른다', () => {
        render(<MessageActionSheet {...baseProps} canModify />);

        fireEvent.click(screen.getByText('chat.room.editMessage'));
        expect(baseProps.onEdit).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByText('chat.room.deleteMessage'));
        expect(baseProps.onDelete).toHaveBeenCalledTimes(1);
    });

    it('leaves out copy and edit for a message with no text, keeping reply and delete', () => {
        render(<MessageActionSheet {...baseProps} canModify hasText={false} />);

        const labels = screen
            .getAllByText(/^chat\.(room|thread)\.(replyAction|copyMessage|editMessage|deleteMessage)$/)
            .map(node => node.textContent);
        expect(labels).toEqual(['chat.thread.replyAction', 'chat.room.deleteMessage']);
        expect(screen.getByLabelText('chat.room.moreEmoji')).toBeInTheDocument();
    });

    it('서버 삭제는 미전송 삭제와 다른 문구 키를 쓴다', () => {
        render(<MessageActionSheet {...baseProps} canModify />);

        expect(screen.getByText('chat.room.deleteMessage')).toBeInTheDocument();
        expect(screen.queryByText('chat.room.delete')).not.toBeInTheDocument();
    });
});

describe('MessageActionSheet — Share file', () => {
    const fileMessage = {
        cid: 'c',
        id: 'm',
        chatNo: 3,
        upload$$: [
            {
                id: 'd1',
                status: 'stored',
                orgUrl: 'https://s3/d1',
                contentType: 'application/pdf',
                stereo: 'file',
                name: 'a.pdf',
            },
            {
                id: 'd2',
                status: 'stored',
                orgUrl: 'https://s3/d2',
                contentType: 'application/pdf',
                stereo: 'file',
                name: 'b.pdf',
            },
        ],
    } as never;
    const canShare = () =>
        shellCapabilities.setReport({
            protocolVersion: '2.3.0',
            supportedWebMessages: ['SaveToPhotoLibrary', 'ShareFile'],
            supportedAppMessages: [],
        });

    afterEach(() => act(() => shellCapabilities.reset()));

    it('is not offered without the handshake listing ShareFile — a browser has none', () => {
        render(<MessageActionSheet {...baseProps} fileMessage={fileMessage} />);
        expect(screen.queryByText('chat.attach.fileCard.share')).not.toBeInTheDocument();
    });

    it('is not offered for a message without a document', () => {
        canShare();
        const photos = {
            cid: 'c',
            id: 'm',
            chatNo: 3,
            upload$$: [{ id: 'p1', status: 'stored', orgUrl: 'https://s3/p1', contentType: 'image/jpeg' }],
        } as never;
        render(<MessageActionSheet {...baseProps} fileMessage={photos} />);
        expect(screen.queryByText('chat.attach.fileCard.share')).not.toBeInTheDocument();
    });

    it('sits below every other row, shares the first document and closes the sheet', () => {
        canShare();
        render(<MessageActionSheet {...baseProps} canModify fileMessage={fileMessage} />);

        const labels = screen
            .getAllByText(
                /^chat\.(room|thread|attach\.fileCard)\.(replyAction|copyMessage|editMessage|deleteMessage|share)$/
            )
            .map(node => node.textContent);
        expect(labels.at(-1)).toBe('chat.attach.fileCard.share');

        fireEvent.click(screen.getByText('chat.attach.fileCard.share'));
        expect(shareFile).toHaveBeenCalledWith(expect.objectContaining({ key: 'c/d1', uploadId: 'd1' }));
        expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
    });
});

describe('MessageActionSheet — audio message', () => {
    const audioMessage = {
        cid: 'c',
        id: 'm',
        chatNo: 4,
        upload$$: [
            {
                id: 'a1',
                stereo: 'audio',
                contentType: 'audio/mp4',
                name: 'voice-20261102-101500.m4a',
                orgUrl: 'https://s3/a1',
                status: 'ready',
            },
        ],
    } as never;
    const canShare = () =>
        shellCapabilities.setReport({
            protocolVersion: '2.3.0',
            supportedWebMessages: ['SaveToPhotoLibrary', 'ShareFile'],
            supportedAppMessages: [],
        });
    const rowLabels = () =>
        screen
            .getAllByText(
                /^chat\.(room|thread|attach\.audio|attach\.fileCard)\.(replyAction|copyMessage|editMessage|deleteMessage|save|share)$/
            )
            .map(node => node.textContent);

    afterEach(() => act(() => shellCapabilities.reset()));

    it('orders thread, save, share and delete when the app can share', () => {
        canShare();
        render(<MessageActionSheet {...baseProps} hasText={false} canModify fileMessage={audioMessage} />);

        expect(rowLabels()).toEqual([
            'chat.thread.replyAction',
            'chat.attach.audio.save',
            'chat.attach.audio.share',
            'chat.room.deleteMessage',
        ]);
    });

    it('offers save but no share in a browser, which cannot share a file', () => {
        render(<MessageActionSheet {...baseProps} hasText={false} canModify fileMessage={audioMessage} />);

        expect(rowLabels()).toEqual(['chat.thread.replyAction', 'chat.attach.audio.save', 'chat.room.deleteMessage']);
    });

    it('leaves delete out for a message that is not mine', () => {
        canShare();
        render(<MessageActionSheet {...baseProps} hasText={false} fileMessage={audioMessage} />);

        expect(rowLabels()).toEqual(['chat.thread.replyAction', 'chat.attach.audio.save', 'chat.attach.audio.share']);
    });

    it('does not add the document’s "Share file" row', () => {
        canShare();
        render(<MessageActionSheet {...baseProps} hasText={false} canModify fileMessage={audioMessage} />);

        expect(screen.queryByText('chat.attach.fileCard.share')).not.toBeInTheDocument();
    });

    it('saves the audio file and closes the sheet', () => {
        render(<MessageActionSheet {...baseProps} hasText={false} fileMessage={audioMessage} />);

        fireEvent.click(screen.getByText('chat.attach.audio.save'));

        expect(mockDownloadFile).toHaveBeenCalledWith(
            expect.objectContaining({ key: 'c/a1', uploadId: 'a1', url: 'https://s3/a1', audio: true })
        );
        expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
        expect(shareFile).not.toHaveBeenCalled();
    });

    it('shares the audio file and closes the sheet', () => {
        canShare();
        render(<MessageActionSheet {...baseProps} hasText={false} fileMessage={audioMessage} />);

        fireEvent.click(screen.getByText('chat.attach.audio.share'));

        expect(shareFile).toHaveBeenCalledWith(expect.objectContaining({ key: 'c/a1', audio: true }));
        expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
        expect(mockDownloadFile).not.toHaveBeenCalled();
    });

    it('keeps the old single share row for a document that is not audio', () => {
        canShare();
        const pdfMessage = {
            cid: 'c',
            id: 'm',
            chatNo: 3,
            upload$$: [
                {
                    id: 'd1',
                    stereo: 'file',
                    contentType: 'application/pdf',
                    name: 'a.pdf',
                    orgUrl: 'https://s3/d1',
                    status: 'stored',
                },
            ],
        } as never;
        render(<MessageActionSheet {...baseProps} hasText={false} canModify fileMessage={pdfMessage} />);

        expect(rowLabels()).toEqual([
            'chat.thread.replyAction',
            'chat.room.deleteMessage',
            'chat.attach.fileCard.share',
        ]);
        expect(screen.queryByText('chat.attach.audio.save')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.attach.audio.share')).not.toBeInTheDocument();
    });
});
