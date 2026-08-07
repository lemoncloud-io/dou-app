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
}));

import { ThreadFooter } from './ThreadFooter';
import type { ThreadMeta } from '../utils/buildThread';

const meta = (over: Partial<ThreadMeta> = {}): ThreadMeta => ({
    count: 2,
    lastReplyAt: 1,
    lastReplyNo: 7,
    repliers: [{ id: 'ada', thumbnail: 'https://embed/ada.png' }],
    ...over,
});

const baseProps = { meta: meta(), hasUnseen: false, onOpen: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('ThreadFooter — 스레드 루트의 답글 푸터', () => {
    it('답글 수를 보여주고 탭하면 스레드를 연다', () => {
        const onOpen = jest.fn();
        render(<ThreadFooter {...baseProps} onOpen={onOpen} />);

        expect(screen.getByText('chat.thread.replyCount')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button'));
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('안 본 답글이 있을 때만 점을 찍는다', () => {
        const { container, rerender } = render(<ThreadFooter {...baseProps} hasUnseen={false} />);
        expect(container.querySelector('[aria-hidden]')).toBeNull();

        rerender(<ThreadFooter {...baseProps} hasUnseen />);
        expect(container.querySelector('[aria-hidden]')).not.toBeNull();
    });

    it('답글자가 많아도 아바타는 3개까지만 쌓는다', () => {
        const repliers = ['a', 'b', 'c', 'd'].map(id => ({ id, thumbnail: `https://embed/${id}.png` }));
        render(<ThreadFooter {...baseProps} meta={meta({ repliers, count: 4 })} />);

        expect(screen.getAllByTestId('image-avatar')).toHaveLength(3);
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
