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
    isCopying: false,
    onPickEmoji: jest.fn(),
    onMoreEmoji: jest.fn(),
    onCopy: jest.fn(),
    onReply: jest.fn(),
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

    // 항목 수가 대상 메시지마다 다르다(canReact·canReply·최근 이모지). 높이가 내용을 따라가면
    // 롱프레스마다 복사·답글이 다른 자리에 오므로, 시트는 화면 절반으로 고정한다.
    it('항목 수와 무관하게 화면 절반 높이로 열린다', () => {
        const { rerender } = render(<MessageActionSheet {...baseProps} />);
        expect(screen.getByRole('dialog')).toHaveClass('h-[50vh]');

        // 리액션 줄과 답글이 빠져 복사 하나만 남아도 같은 높이다.
        rerender(<MessageActionSheet {...baseProps} canReact={false} canReply={false} />);
        expect(screen.getByRole('dialog')).toHaveClass('h-[50vh]');
    });

    it('복사/답글 항목이 각각의 핸들러를 부른다', () => {
        render(<MessageActionSheet {...baseProps} />);
        fireEvent.click(screen.getByText('chat.room.copyMessage'));
        fireEvent.click(screen.getByText('chat.thread.replyAction'));
        expect(baseProps.onCopy).toHaveBeenCalled();
        expect(baseProps.onReply).toHaveBeenCalled();
    });
});
