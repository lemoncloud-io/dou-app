import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));

jest.mock('@chatic/ui-kit', () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }));

jest.mock('@chatic/web-ui-kit', () => ({
    BottomSheet: ({ open, children }: any) => (open ? <div data-testid="sheet">{children}</div> : null),
    ImageAvatar: ({ src }: any) => <img data-testid="image-avatar" src={src} alt="" />,
    DefaultAvatar: () => <div data-testid="default-avatar" />,
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

beforeEach(() => jest.clearAllMocks());

describe('ReactionDetailSheet — 이모지별 반응자 목록', () => {
    it('이모지마다 탭을 만들고 각 인원 수를 보여준다', () => {
        render(<ReactionDetailSheet {...baseProps} />);

        const tabs = screen.getAllByRole('tab');
        expect(tabs).toHaveLength(2);
        expect(tabs[0]).toHaveTextContent('👍');
        expect(tabs[0]).toHaveTextContent('2');
        expect(tabs[1]).toHaveTextContent('🎉');
    });

    // 롱프레스한 칩의 이모지가 열렸을 때 선택돼 있어야 한다 — 아니면 사용자가 방금 누른
    // 이모지를 시트에서 다시 찾아야 한다.
    it('길게 누른 칩의 탭이 선택된 채로 열린다', () => {
        render(<ReactionDetailSheet {...baseProps} initialKey="🎉" />);

        const tabs = screen.getAllByRole('tab');
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('초')).toBeInTheDocument();
        expect(screen.queryByText('에이다')).not.toBeInTheDocument();
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

        // ada는 프로필 사진이 있고 bob은 없다.
        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'https://p/ada.png');
        expect(screen.getByTestId('default-avatar')).toBeInTheDocument();
    });

    // 시트가 열려 있는 동안 누군가 리액션을 내리면 탭이 사라진다 — 사라진 탭을 붙들고
    // 빈 목록을 보여주는 대신 남아 있는 첫 탭으로 떨어진다.
    it('선택 중이던 이모지가 사라지면 첫 탭으로 떨어진다', () => {
        const { rerender } = render(<ReactionDetailSheet {...baseProps} initialKey="🎉" />);
        expect(screen.getByText('초')).toBeInTheDocument();

        rerender(<ReactionDetailSheet {...baseProps} tallies={[tallies[0]]} initialKey="🎉" />);

        expect(screen.getByText('에이다')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(1);
    });

    it('닫혀 있으면 아무것도 렌더하지 않는다', () => {
        render(<ReactionDetailSheet {...baseProps} open={false} />);
        expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    });
});
