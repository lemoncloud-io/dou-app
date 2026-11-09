import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

// The `emoji` namespace names 👍 only, so 🎉 stands in for a reaction from outside the curation.
const mockEmojiNames: Record<string, string> = { '👍': '올린 엄지' };
jest.mock('react-i18next', () => ({
    useTranslation: (ns?: string) => ({
        t: (k: string, options?: { defaultValue?: string }) =>
            ns === 'emoji' ? (mockEmojiNames[k] ?? options?.defaultValue ?? k) : k,
        i18n: { language: 'ko' },
    }),
}));

jest.mock('@chatic/ui-kit', () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }));

// Commit counter. The sheet re-invokes BottomSheet on every render, so this distinguishes
// "opened on the right tab" from "opened on the first tab and corrected itself" — two states
// that look identical once RTL has flushed effects.
const mockCommits = { count: 0 };

jest.mock('@chatic/web-ui-kit', () => ({
    BottomSheet: ({ open, children, className }: any) => {
        mockCommits.count += 1;
        return open ? (
            <div data-testid="sheet" className={className}>
                {children}
            </div>
        ) : null;
    },
    ImageAvatar: ({ src }: any) => <img data-testid="image-avatar" src={src} alt="" />,
    DefaultAvatar: () => <div data-testid="default-avatar" />,
    // The tabs are the kit's reaction chip one size up. `mine` and `selected` are surfaced as
    // data attributes because they are two independent facts here — a tab can be mine, open,
    // both or neither — and a stub that collapsed them would hide that.
    ReactionChip: ({ emoji, count, mine, selected, ...rest }: any) => (
        <button {...rest} data-mine={!!mine} data-selected={!!selected}>
            <span>{emoji}</span>
            <span>{count}</span>
        </button>
    ),
}));

import { ReactionDetailSheet } from './ReactionDetailSheet';
import type { ReactionTally } from '../utils/foldReactions';

const tallies: ReactionTally[] = [
    { emoji: '👍', key: '👍', userIds: ['ada', 'bob'], mine: false },
    { emoji: '🎉', key: '🎉', userIds: ['cho'], mine: true },
];

const names: Record<string, string> = { ada: '에이다', bob: '밥', cho: '초' };
const avatars: Record<string, string> = { ada: 'https://p/ada.png' };

const baseProps = {
    open: true,
    onOpenChange: jest.fn(),
    tallies,
    nameOf: (id: string) => names[id] ?? id,
    avatarOf: (id: string) => avatars[id],
};

beforeEach(() => {
    jest.clearAllMocks();
    mockCommits.count = 0;
});

describe('ReactionDetailSheet — 이모지별 반응자 목록', () => {
    it('이모지마다 탭을 만들고 각 인원 수를 보여준다', () => {
        render(<ReactionDetailSheet {...baseProps} />);

        const tabs = screen.getAllByRole('tab');
        expect(tabs).toHaveLength(2);
        expect(tabs[0]).toHaveTextContent('👍');
        expect(tabs[0]).toHaveTextContent('2');
        expect(tabs[1]).toHaveTextContent('🎉');
    });

    // The emoji of the long-pressed chip must already be selected when it opens — otherwise the
    // user has to go find the emoji they just tapped again inside the sheet.
    it('길게 누른 칩의 탭이 선택된 채로 열린다', () => {
        render(<ReactionDetailSheet {...baseProps} initialKey="🎉" />);

        const tabs = screen.getAllByRole('tab');
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('초')).toBeInTheDocument();
        expect(screen.queryByText('에이다')).not.toBeInTheDocument();
    });

    // A hole exposed during review: dropping the initial state and leaving it to the effect
    // alone would still pass the test above — because RTL only looks after the effect has
    // flushed. In reality that produces a flash where the first tab is shown for one frame before
    // switching. This catches that gap via the commit count.
    it('첫 커밋에 이미 맞는 탭이다 — 첫 탭을 보여줬다가 고치지 않는다', () => {
        render(<ReactionDetailSheet {...baseProps} initialKey="🎉" />);

        expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
        expect(mockCommits.count).toBe(1);
    });

    it('initialKey가 없으면 첫 탭을 연다', () => {
        render(<ReactionDetailSheet {...baseProps} />);

        expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('에이다')).toBeInTheDocument();
    });

    it('탭을 바꾸면 그 이모지의 반응자로 목록이 바뀐다', () => {
        render(<ReactionDetailSheet {...baseProps} />);

        fireEvent.click(screen.getAllByRole('tab')[1]);

        expect(screen.getByText('초')).toBeInTheDocument();
        expect(screen.queryByText('밥')).not.toBeInTheDocument();
    });

    it('반응자마다 프로필 사진을 보여주고, 없으면 기본 아바타로 떨어진다', () => {
        render(<ReactionDetailSheet {...baseProps} />);

        // ada has a profile photo, bob doesn't.
        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'https://p/ada.png');
        expect(screen.getByTestId('default-avatar')).toBeInTheDocument();
    });

    // If someone removes a reaction while the sheet is open, its tab disappears — instead of
    // holding onto the vanished tab and showing an empty list, fall back to the first remaining tab.
    it('선택 중이던 이모지가 사라지면 첫 탭으로 떨어진다', () => {
        const { rerender } = render(<ReactionDetailSheet {...baseProps} initialKey="🎉" />);
        expect(screen.getByText('초')).toBeInTheDocument();

        rerender(<ReactionDetailSheet {...baseProps} tallies={[tallies[0]]} initialKey="🎉" />);

        expect(screen.getByText('에이다')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(1);
    });

    // The list of reactors can grow and shrink even while the sheet is open. If the height
    // tracked the content, the line the user is reading would move under their finger, so the
    // sheet is pinned to half the screen and only the list scrolls.
    it('내용과 무관하게 화면 절반 높이로 열린다', () => {
        const { rerender } = render(<ReactionDetailSheet {...baseProps} />);
        expect(screen.getByTestId('sheet')).toHaveClass('h-[50vh]');

        // Even switching to a tab with only one reactor, the sheet keeps the same height.
        rerender(<ReactionDetailSheet {...baseProps} tallies={[tallies[1]]} />);
        expect(screen.getByTestId('sheet')).toHaveClass('h-[50vh]');
        // The leftover space is absorbed by the list, not the sheet.
        expect(screen.getByRole('list')).toHaveClass('flex-1', 'overflow-y-auto');
    });

    it("names the open tab's emoji under the tab row, and follows a tab switch", () => {
        render(<ReactionDetailSheet {...baseProps} />);
        expect(screen.getByTestId('reaction-emoji-name')).toHaveTextContent('올린 엄지');

        // 🎉 has no name in the table: the line goes rather than showing a blank or a key.
        fireEvent.click(screen.getAllByRole('tab')[1]);
        expect(screen.queryByTestId('reaction-emoji-name')).not.toBeInTheDocument();
    });

    it('labels a named tab with its name and count, since the glyph is hidden from assistive tech', () => {
        render(<ReactionDetailSheet {...baseProps} />);

        const [named, unnamed] = screen.getAllByRole('tab');
        expect(named).toHaveAttribute('aria-label', '올린 엄지 2');
        expect(unnamed).not.toHaveAttribute('aria-label');
    });

    it('닫혀 있으면 아무것도 렌더하지 않는다', () => {
        render(<ReactionDetailSheet {...baseProps} open={false} />);
        expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    });
});
