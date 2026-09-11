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

    // 새 댓글은 점이 아니라 개수로 말한다. 끼어들 만한 줄이면 몇 개가 새로 왔는지가 볼 값이다.
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

    // 세 칸 사이에만 점이 붙는다 — 답글 수만 있으면 점은 하나도 없어야 한다.
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

    // 얼굴만 옮기는 게 아니라 라벨 순서까지 거울처럼 뒤집힌다 — 디자인은 그쪽에서
    // "오후 12:06 · 새 댓글 1개 · 댓글 3개"로 읽힌다.
    it('뒤집을 때 라벨 묶음도 함께 뒤집는다', () => {
        const { rerender } = render(
            <ThreadSummary replyLabel="댓글 3개" newReplyLabel="새 댓글 1개" time="오후 12:06" />
        );
        expect(screen.getByText('댓글 3개').parentElement).not.toHaveClass('flex-row-reverse');

        rerender(<ThreadSummary replyLabel="댓글 3개" newReplyLabel="새 댓글 1개" time="오후 12:06" align="end" />);
        expect(screen.getByText('댓글 3개').parentElement).toHaveClass('flex-row-reverse');
    });

    // 뒤집는 건 CSS라서 DOM 순서는 그대로다 — 스크린리더는 여전히 "누가"를 먼저 듣는다.
    it('뒤집어도 DOM 순서는 얼굴 먼저다', () => {
        const { container } = render(<ThreadSummary avatars={faces(1)} replyLabel="댓글 3개" align="end" />);

        const face = screen.getByTestId('face');
        const label = screen.getByText('댓글 3개');
        expect(face.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(container.firstChild).toHaveClass('flex-row-reverse');
    });
});
