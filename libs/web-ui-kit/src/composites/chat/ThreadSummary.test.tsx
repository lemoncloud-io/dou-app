import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { ThreadSummary } from './ThreadSummary';

const faces = (n: number) => Array.from({ length: n }, (_, i) => <span key={i} data-testid="face" />);

describe('ThreadSummary — 스레드 요약 줄', () => {
    it('답글 수를 항상 적고 탭하면 열린다', () => {
        const onClick = jest.fn();
        render(<ThreadSummary replyLabel="댓글 3개" onClick={onClick} />);

        expect(screen.getByText('댓글 3개')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('건네받은 얼굴을 그대로 쌓는다', () => {
        render(<ThreadSummary avatars={faces(3)} replyLabel="댓글 3개" />);

        expect(screen.getAllByTestId('face')).toHaveLength(3);
    });

    it('넘치는 사람 수는 +N 알약으로 닫는다', () => {
        render(<ThreadSummary avatars={faces(5)} overflowCount={2} replyLabel="댓글 7개" />);

        expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('넘치는 사람이 없으면 알약을 그리지 않는다', () => {
        render(<ThreadSummary avatars={faces(2)} overflowCount={0} replyLabel="댓글 2개" />);

        expect(screen.queryByText(/^\+/)).toBeNull();
    });

    // New comments speak through a count, not a dot. If the row is worth interrupting for, how many arrived is the value worth reading.
    it('새 댓글 라벨은 있을 때만 나오고 point-blue를 쓴다', () => {
        const { rerender } = render(<ThreadSummary replyLabel="댓글 3개" />);
        expect(screen.queryByText('새 댓글 1개')).toBeNull();

        rerender(<ThreadSummary replyLabel="댓글 3개" newReplyLabel="새 댓글 1개" />);
        expect(screen.getByText('새 댓글 1개')).toHaveClass('text-point-blue');
    });

    it('시각은 있을 때만 나온다', () => {
        const { rerender } = render(<ThreadSummary replyLabel="댓글 3개" />);
        expect(screen.queryByText('오후 12:06')).toBeNull();

        rerender(<ThreadSummary replyLabel="댓글 3개" time="오후 12:06" />);
        expect(screen.getByText('오후 12:06')).toBeInTheDocument();
    });

    // A dot appears only between the three segments — with only the reply count present, there should be no dots at all.
    it('칸 사이에만 구분점을 넣는다', () => {
        const { container, rerender } = render(<ThreadSummary replyLabel="댓글 3개" />);
        expect(container.textContent).not.toContain('•');

        rerender(<ThreadSummary replyLabel="댓글 3개" newReplyLabel="새 댓글 1개" time="오후 12:06" />);
        expect(container.textContent?.match(/•/g)).toHaveLength(2);
    });

    it('내 메시지 쪽은 줄을 뒤집어 얼굴을 뒤로 보낸다', () => {
        const { rerender } = render(<ThreadSummary replyLabel="댓글 3개" />);
        expect(screen.getByRole('button')).not.toHaveClass('flex-row-reverse');

        rerender(<ThreadSummary replyLabel="댓글 3개" align="end" />);
        expect(screen.getByRole('button')).toHaveClass('flex-row-reverse');
    });

    // Not just the faces move — the label order mirrors too, since the design reads
    // "12:06 PM · 1 new comment · 3 comments" on that side.
    it('뒤집을 때 라벨 묶음도 함께 뒤집는다', () => {
        const { rerender } = render(
            <ThreadSummary replyLabel="댓글 3개" newReplyLabel="새 댓글 1개" time="오후 12:06" />
        );
        expect(screen.getByText('댓글 3개').parentElement).not.toHaveClass('flex-row-reverse');

        rerender(<ThreadSummary replyLabel="댓글 3개" newReplyLabel="새 댓글 1개" time="오후 12:06" align="end" />);
        expect(screen.getByText('댓글 3개').parentElement).toHaveClass('flex-row-reverse');
    });

    // The flip is CSS-only, so DOM order stays put — a screen reader still hears "who" first.
    it('뒤집어도 DOM 순서는 얼굴 먼저다', () => {
        const { container } = render(<ThreadSummary avatars={faces(1)} replyLabel="댓글 3개" align="end" />);

        const face = screen.getByTestId('face');
        const label = screen.getByText('댓글 3개');
        expect(face.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(container.firstChild).toHaveClass('flex-row-reverse');
    });
});
