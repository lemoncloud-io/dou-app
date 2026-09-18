import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));

import { MessageActionSheet } from './MessageActionSheet';
import { useRecentEmojiStore, QUICK_REACTIONS } from '../stores/useRecentEmojiStore';

const baseProps = {
    open: true,
    onOpenChange: jest.fn(),
    canReact: true,
    canReply: true,
    canModify: false,
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

    // Pending/failed rows have no server id yet — a reaction or a reply would target a temp id.
    it('canReact/canReply가 꺼지면 리액션 줄과 답글 항목이 사라진다', () => {
        render(<MessageActionSheet {...baseProps} canReact={false} canReply={false} />);

        expect(screen.queryByLabelText('chat.room.moreEmoji')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.thread.replyAction')).not.toBeInTheDocument();
        expect(screen.getByText('chat.room.copyMessage')).toBeInTheDocument();
    });

    // Opens to its content height (Figma 4712:16421). It used to be pinned to half the screen so
    // copy/thread landed in the same spot on every long press, but the design keeps that spot
    // fixed by row count instead — the quick row is always 6 items + the add button, and the two
    // items below it are always the same two. Only the sheet's top edge moves.
    it('절반 높이 고정을 버리고 내용 높이로 열린다', () => {
        render(<MessageActionSheet {...baseProps} />);

        const dialog = screen.getByRole('dialog');
        expect(dialog).not.toHaveClass('h-[50vh]');
        expect(dialog).toHaveClass('rounded-t-[32px]');
    });

    // There's no title bar and no close button — the grabber is the only chrome. The title just
    // isn't rendered visually; it still remains for the screen reader.
    it('제목 바를 그리지 않지만 접근성 이름은 남긴다', () => {
        render(<MessageActionSheet {...baseProps} />);

        expect(screen.getByText('chat.room.messageActions')).toHaveClass('sr-only');
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    // Thread on top, copy below (the design order) — the reason to open this sheet with a long
    // press is the thread; copy is second choice.
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

    // Edit and delete only on my own message. The verdict is the shared `canModifyMessage`'s to
    // make; the page hands the answer down.
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
        // The order is the contract: the two existing rows must not move out from under a thumb.
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

    // Sharing wording with 'chat.room.delete' — the ✕ on an unsent row — would read as "the one I
    // removed earlier never reached them either". A server delete gets its own key.
    it('서버 삭제는 미전송 삭제와 다른 문구 키를 쓴다', () => {
        render(<MessageActionSheet {...baseProps} canModify />);

        expect(screen.getByText('chat.room.deleteMessage')).toBeInTheDocument();
        expect(screen.queryByText('chat.room.delete')).not.toBeInTheDocument();
    });
});
