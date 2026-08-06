import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));

import { ReactionChips } from './ReactionChips';
import type { ReactionTally } from '../utils/foldReactions';

const tally = (over: Partial<ReactionTally> = {}): ReactionTally => ({
    emoji: '👍',
    key: '👍',
    userIds: ['ada'],
    mine: false,
    ...over,
});

const nameOf = (id: string) => id;

describe('ReactionChips — 메시지 하단 리액션 칩', () => {
    it('칩이 없으면 아무것도 렌더하지 않는다', () => {
        const { container } = render(<ReactionChips tallies={[]} nameOf={nameOf} onToggle={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('이모지와 인원 수를 함께 보여준다', () => {
        render(<ReactionChips tallies={[tally({ userIds: ['ada', 'bob'] })]} nameOf={nameOf} onToggle={jest.fn()} />);
        expect(screen.getByText('👍')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('내 리액션 여부를 aria-pressed로 드러낸다', () => {
        render(<ReactionChips tallies={[tally({ mine: true })]} nameOf={nameOf} onToggle={jest.fn()} />);
        expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    // The toggle passes the current `mine` so the caller can send the opposite target state.
    it('탭하면 현재 mine 상태와 함께 onToggle을 부른다', () => {
        const onToggle = jest.fn();
        render(<ReactionChips tallies={[tally({ mine: true })]} nameOf={nameOf} onToggle={onToggle} />);
        fireEvent.click(screen.getByRole('button'));
        expect(onToggle).toHaveBeenCalledWith('👍', true);
    });
});
