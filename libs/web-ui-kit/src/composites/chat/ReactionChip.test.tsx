import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { ReactionAddButton, ReactionChip, formatReactionCount } from './ReactionChip';

describe('formatReactionCount — 리액션 수 표기', () => {
    it('99까지는 그대로 적는다', () => {
        expect(formatReactionCount(1)).toBe('1');
        expect(formatReactionCount(99)).toBe('99');
    });

    // 칩은 말풍선 밑 26px 줄이다. 세 자리가 들어오면 줄이 늘어나므로 디자인은 +99로 접는다.
    it('100 이상은 +99로 접는다', () => {
        expect(formatReactionCount(100)).toBe('+99');
        expect(formatReactionCount(12345)).toBe('+99');
    });
});

describe('ReactionChip — 리액션 칩', () => {
    it('이모지와 수를 보여준다', () => {
        render(<ReactionChip emoji="👍" count={3} />);

        const chip = screen.getByRole('button');
        expect(chip).toHaveTextContent('👍');
        expect(chip).toHaveTextContent('3');
    });

    // 내 리액션은 테두리와 숫자 색으로만 말한다 — 이모지를 물들이면 13px에서 다른 이모지로
    // 읽힌다.
    it('내 리액션은 강조 테두리와 강조 숫자로 표시한다', () => {
        const { rerender } = render(<ReactionChip emoji="👍" count={3} mine />);

        expect(screen.getByRole('button')).toHaveClass('border-main-accent');
        expect(screen.getByText('3')).toHaveClass('text-main-accent');

        rerender(<ReactionChip emoji="👍" count={3} />);
        expect(screen.getByRole('button')).not.toHaveClass('border-main-accent');
        expect(screen.getByText('3')).toHaveClass('text-foreground');
    });

    it('내 리액션 여부를 aria-pressed로 알린다', () => {
        const { rerender } = render(<ReactionChip emoji="👍" count={1} mine />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');

        rerender(<ReactionChip emoji="👍" count={1} />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    });

    // 반응자 시트는 이 칩을 탭으로 쓴다 — 그때 aria-pressed는 역할이 맞지 않으므로
    // 호스트가 role/aria-selected로 갈아탈 수 있어야 한다.
    it('호스트가 탭 역할로 갈아탈 수 있다', () => {
        render(<ReactionChip emoji="👍" count={1} mine role="tab" aria-selected aria-pressed={undefined} />);

        const tab = screen.getByRole('tab');
        expect(tab).toHaveAttribute('aria-selected', 'true');
        expect(tab).not.toHaveAttribute('aria-pressed');
    });

    // "내 것"과 "열린 탭"은 서로 다른 사실이다 — 칩 하나가 둘 다, 하나만, 혹은 아무것도
    // 아닐 수 있다.
    it('선택 밑줄은 내 것 여부와 독립이다', () => {
        const { container, rerender } = render(<ReactionChip emoji="👍" count={1} selected />);
        expect(container.querySelector('.bg-main-accent')).not.toBeNull();
        expect(screen.getByRole('button')).not.toHaveClass('border-main-accent');

        rerender(<ReactionChip emoji="👍" count={1} mine />);
        expect(container.querySelector('.bg-main-accent')).toBeNull();
    });

    it('탭하면 onClick이 불린다', () => {
        const onClick = jest.fn();
        render(<ReactionChip emoji="👍" count={1} onClick={onClick} />);

        fireEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('sm은 26px, md는 40px 높이로 선다', () => {
        const { rerender } = render(<ReactionChip emoji="👍" count={1} />);
        expect(screen.getByRole('button')).toHaveClass('h-[26px]');

        rerender(<ReactionChip emoji="👍" count={1} size="md" />);
        expect(screen.getByRole('button')).toHaveClass('h-10');
    });
});

describe('ReactionAddButton — 리액션 추가 버튼', () => {
    // 칩을 누르는 것과 이걸 누르는 것은 다른 행위다 — 이건 토글이 아니라 피커를 연다.
    it('토글이 아니므로 pressed 상태를 갖지 않는다', () => {
        render(<ReactionAddButton aria-label="리액션 추가" />);

        expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
    });

    it('탭하면 onClick이 불린다', () => {
        const onClick = jest.fn();
        render(<ReactionAddButton onClick={onClick} aria-label="리액션 추가" />);

        fireEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
