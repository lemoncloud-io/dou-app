import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));

jest.mock('@chatic/ui-kit', () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(' ') }));

// Stand-ins so the assertions target which avatar this footer chose, not how the kit draws it.
jest.mock('@chatic/web-ui-kit', () => ({
    ImageAvatar: ({ src }: any) => <img data-testid="image-avatar" src={src} alt="" />,
    DefaultAvatar: () => <div data-testid="default-avatar" />,
    // Faithful enough to assert against: which faces were chosen, and which of the three text
    // segments the footer decided to print.
    ThreadSummary: ({ avatars, overflowCount, replyLabel, newReplyLabel, time, align, ...rest }: any) => (
        <button {...rest} data-align={align}>
            {avatars}
            {overflowCount > 0 && <span data-testid="overflow">+{overflowCount}</span>}
            <span data-testid="reply-label">{replyLabel}</span>
            {newReplyLabel && <span data-testid="new-reply-label">{newReplyLabel}</span>}
            {time && <span data-testid="time">{time}</span>}
        </button>
    ),
}));

import { ThreadFooter } from './ThreadFooter';
import type { ThreadMeta } from '../utils/buildThread';

const meta = (over: Partial<ThreadMeta> = {}): ThreadMeta => ({
    count: 2,
    lastReplyAt: 1,
    lastReplyNo: 7,
    repliers: [{ id: 'ada', thumbnail: 'https://embed/ada.png' }],
    entries: [
        { chatNo: 6, ownerId: 'ada' },
        { chatNo: 7, ownerId: 'bob' },
    ],
    ...over,
});

const baseProps = { meta: meta(), unseenCount: 0, onOpen: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('ThreadFooter — 스레드 루트의 답글 푸터', () => {
    it('답글 수를 보여주고 탭하면 스레드를 연다', () => {
        const onOpen = jest.fn();
        render(<ThreadFooter {...baseProps} onOpen={onOpen} />);

        expect(screen.getByTestId('reply-label')).toHaveTextContent('chat.thread.replyCount');
        fireEvent.click(screen.getByRole('button'));
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    // 점이 아니라 개수다 — 끼어들 만한 줄이면 "몇 개가 새로 왔는지"가 볼 값이다.
    it('안 본 답글이 있을 때만 새 댓글 수를 적는다', () => {
        const { rerender } = render(<ThreadFooter {...baseProps} unseenCount={0} />);
        expect(screen.queryByTestId('new-reply-label')).toBeNull();

        rerender(<ThreadFooter {...baseProps} unseenCount={3} />);
        expect(screen.getByTestId('new-reply-label')).toHaveTextContent('chat.thread.newReplyCount');
    });

    // 마지막 답글 시각은 루트의 시각이 아니다 — 접힌 스레드가 달리 보여줄 수 없는 유일한 값이다.
    it('마지막 답글 시각을 방이 준 포맷터로 적는다', () => {
        const formatTime = jest.fn(() => '오후 12:06');
        render(<ThreadFooter {...baseProps} meta={meta({ lastReplyAt: 1_700_000_000_000 })} formatTime={formatTime} />);

        expect(formatTime).toHaveBeenCalledWith(new Date(1_700_000_000_000));
        expect(screen.getByTestId('time')).toHaveTextContent('오후 12:06');
    });

    it('마지막 답글 시각이 없으면 시각 칸을 비운다', () => {
        render(<ThreadFooter {...baseProps} meta={meta({ lastReplyAt: 0 })} formatTime={() => '오후 12:06'} />);

        expect(screen.queryByTestId('time')).toBeNull();
    });

    it('답글자가 많아도 아바타는 5개까지만 쌓고 나머지는 +N으로 센다', () => {
        const repliers = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => ({
            id,
            thumbnail: `https://embed/${id}.png`,
        }));
        render(<ThreadFooter {...baseProps} meta={meta({ repliers, count: 7 })} />);

        expect(screen.getAllByTestId('image-avatar')).toHaveLength(5);
        expect(screen.getByTestId('overflow')).toHaveTextContent('+2');
    });

    it('내 메시지의 푸터는 반대쪽으로 정렬한다', () => {
        render(<ThreadFooter {...baseProps} align="end" />);

        expect(screen.getByRole('button')).toHaveAttribute('data-align', 'end');
    });

    // ADR-0047 결정 5 — 파생(buildThreadIndex)은 프로필 캐시를 모른 채 두고,
    // 우선순위 적용은 표시하는 이 컴포넌트가 한다.
    describe('아바타 해석 우선순위', () => {
        it('avatarOf가 임베드 owner$ 썸네일을 이긴다', () => {
            render(<ThreadFooter {...baseProps} avatarOf={() => 'https://profile/ada.png'} />);

            expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'https://profile/ada.png');
        });

        it('avatarOf가 못 찾으면 임베드 값으로 폴백한다', () => {
            render(<ThreadFooter {...baseProps} avatarOf={() => undefined} />);

            expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'https://embed/ada.png');
        });

        // 낙관 답글은 owner$가 없다 — 프로필이 아바타를 채우는 유일한 재료다.
        it('임베드가 없는 낙관 답글도 프로필로 아바타가 뜬다', () => {
            render(
                <ThreadFooter
                    {...baseProps}
                    meta={meta({ repliers: [{ id: 'ada' }] })}
                    avatarOf={() => 'https://profile/ada.png'}
                />
            );

            expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'https://profile/ada.png');
        });

        it('둘 다 없으면 기본 아바타를 쓴다', () => {
            render(<ThreadFooter {...baseProps} meta={meta({ repliers: [{ id: 'ada' }] })} />);

            expect(screen.getByTestId('default-avatar')).toBeInTheDocument();
        });
    });
});
