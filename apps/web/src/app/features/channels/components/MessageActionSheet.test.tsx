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

    // 내용 높이로 열린다(Figma 4712:16421). 예전엔 화면 절반으로 고정해서 롱프레스마다 복사·
    // 스레드가 같은 자리에 오게 했는데, 디자인은 그 자리를 줄 수로 지킨다 — 퀵 줄은 항상
    // 6개 + 추가 버튼이고 아래 두 항목도 매번 같은 둘이다. 움직이는 건 시트의 윗변뿐이다.
    it('절반 높이 고정을 버리고 내용 높이로 열린다', () => {
        render(<MessageActionSheet {...baseProps} />);

        const dialog = screen.getByRole('dialog');
        expect(dialog).not.toHaveClass('h-[50vh]');
        expect(dialog).toHaveClass('rounded-t-[32px]');
    });

    // 제목 바도 닫기 버튼도 없다 — 그래버가 유일한 크롬이다. 제목은 그려지지 않을 뿐
    // 스크린리더에는 남는다.
    it('제목 바를 그리지 않지만 접근성 이름은 남긴다', () => {
        render(<MessageActionSheet {...baseProps} />);

        expect(screen.getByText('chat.room.messageActions')).toHaveClass('sr-only');
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    // 스레드가 위, 복사가 아래(디자인 순서) — 이 시트를 롱프레스로 여는 이유가 스레드고
    // 복사는 차선이다.
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
});
