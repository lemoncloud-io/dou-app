import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

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

    // ADR-0047 결정 1 — 두 번째 리액션이 첫 번째와 같은 비용(롱프레스 450ms + 시트)이 아니게 한다.
    describe('추가 버튼 (+)', () => {
        it('칩이 없으면 줄 자체가 없으므로 + 도 나오지 않는다', () => {
            const { container } = render(
                <ReactionChips tallies={[]} nameOf={nameOf} onToggle={jest.fn()} onAdd={jest.fn()} />
            );
            expect(container).toBeEmptyDOMElement();
        });

        it('칩이 있으면 줄의 마지막 항목으로 + 가 붙는다', () => {
            render(<ReactionChips tallies={[tally()]} nameOf={nameOf} onToggle={jest.fn()} onAdd={jest.fn()} />);

            const buttons = screen.getAllByRole('button');
            expect(buttons).toHaveLength(2);
            expect(buttons[1]).toHaveAttribute('aria-label', 'chat.room.addReaction');
        });

        it('onAdd가 없으면 + 를 렌더하지 않는다', () => {
            render(<ReactionChips tallies={[tally()]} nameOf={nameOf} onToggle={jest.fn()} />);
            expect(screen.getAllByRole('button')).toHaveLength(1);
        });

        it('탭하면 onAdd만 부른다 — 토글이 아니다', () => {
            const onAdd = jest.fn();
            const onToggle = jest.fn();
            render(<ReactionChips tallies={[tally()]} nameOf={nameOf} onToggle={onToggle} onAdd={onAdd} />);

            fireEvent.click(screen.getByLabelText('chat.room.addReaction'));

            expect(onAdd).toHaveBeenCalledTimes(1);
            expect(onToggle).not.toHaveBeenCalled();
        });

        // 눌림 상태를 갖지 않는다 — 칩 탭과 + 탭은 다른 행위이고 줄이 둘을 흐리면 안 된다.
        it('+ 는 aria-pressed를 갖지 않는다', () => {
            render(<ReactionChips tallies={[tally()]} nameOf={nameOf} onToggle={jest.fn()} onAdd={jest.fn()} />);
            expect(screen.getByLabelText('chat.room.addReaction')).not.toHaveAttribute('aria-pressed');
        });
    });

    // ADR-0047 개정 — 칩은 제스처 둘을 나눠 갖는다: 탭은 흔한 쪽(토글), 꾹 누르기는
    // 반응자 상세. 하나의 제스처가 두 동작을 동시에 일으키면 안 된다.
    describe('칩 롱프레스 — 반응자 상세', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        const press = (el: HTMLElement) => {
            fireEvent.pointerDown(el);
            act(() => {
                jest.advanceTimersByTime(600);
            });
        };

        it('꾹 누르면 그 칩의 fold key로 onShowReactors를 부른다', () => {
            const onShowReactors = jest.fn();
            render(
                <ReactionChips
                    tallies={[tally({ emoji: '❤️', key: '❤' })]}
                    nameOf={nameOf}
                    onToggle={jest.fn()}
                    onShowReactors={onShowReactors}
                />
            );

            press(screen.getByRole('button'));

            // 표시 문자열(❤️)이 아니라 정규화된 fold key(❤) — 시트가 fold와 같은 기준으로 찾는다.
            expect(onShowReactors).toHaveBeenCalledWith('❤');
        });

        it('롱프레스로 끝난 제스처는 토글을 일으키지 않는다', () => {
            const onToggle = jest.fn();
            render(
                <ReactionChips tallies={[tally()]} nameOf={nameOf} onToggle={onToggle} onShowReactors={jest.fn()} />
            );

            const chip = screen.getByRole('button');
            press(chip);
            fireEvent.click(chip); // 롱프레스 뒤에 따라오는 click
            expect(onToggle).not.toHaveBeenCalled();
        });

        it('임계값 전에 떼면 롱프레스가 아니라 토글이다', () => {
            const onToggle = jest.fn();
            const onShowReactors = jest.fn();
            render(
                <ReactionChips
                    tallies={[tally({ mine: true })]}
                    nameOf={nameOf}
                    onToggle={onToggle}
                    onShowReactors={onShowReactors}
                />
            );

            const chip = screen.getByRole('button');
            fireEvent.pointerDown(chip);
            act(() => {
                jest.advanceTimersByTime(200);
            });
            fireEvent.pointerUp(chip);
            fireEvent.click(chip);

            expect(onShowReactors).not.toHaveBeenCalled();
            expect(onToggle).toHaveBeenCalledWith('\u{1F44D}', true);
        });

        it('onShowReactors가 없으면 롱프레스가 아무 일도 하지 않는다', () => {
            const onToggle = jest.fn();
            render(<ReactionChips tallies={[tally()]} nameOf={nameOf} onToggle={onToggle} />);

            const chip = screen.getByRole('button');
            press(chip);
            fireEvent.click(chip);

            expect(onToggle).toHaveBeenCalledTimes(1);
        });
    });
});
