import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InviteAcceptScreen, type InviteAcceptScreenProps } from './InviteAcceptScreen';
import type { InviteCountdown } from '../../hooks/useInviteCountdown';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            const copy: Record<string, string> = {
                'inviteAccept.target.you': 'You',
                'inviteAccept.target.group': '그룹 대화',
                'inviteAccept.target.oneToOne': '1:1 대화',
                'inviteAccept.invitedBy': '님이 DoU에 당신을 초대했어요',
                'inviteAccept.description': '초대 수락하고 대화를 시작해 보세요.',
                'inviteAccept.decline': '거절',
                'inviteAccept.accept': '수락',
                'inviteAccept.close': '닫기',
                'inviteAccept.expiry.label': '초대 링크 유효시간',
            };
            if (key === 'inviteAccept.target.roomFriends') return `방 친구 ${opts?.count}`;
            if (key === 'inviteAccept.expiry.remaining') return `${opts?.time} 남음`;
            return copy[key] ?? key;
        },
    }),
}));

const COUNTDOWN: InviteCountdown = {
    days: 0,
    hours: 1,
    minutes: 2,
    seconds: 3,
    isExpired: false,
    isImminent: false,
};

const setup = (over: Partial<InviteAcceptScreenProps> = {}) =>
    render(
        <InviteAcceptScreen
            inviterName="Sunny"
            countdown={COUNTDOWN}
            isAccepting={false}
            onAccept={jest.fn()}
            onClose={jest.fn()}
            {...over}
        />
    );

describe('InviteAcceptScreen — group / 1:1 variants', () => {
    it('shows the place card and the group caption for a group invite', () => {
        setup({ targetKind: 'group', placeName: '레몬클라우드', placeIntro: '함께 일하는 공간' });

        expect(screen.getByTestId('invite-place-card')).toBeTruthy();
        expect(screen.getByText('레몬클라우드')).toBeTruthy();
        expect(screen.getByText('함께 일하는 공간')).toBeTruthy();
        expect(screen.getByText('그룹 대화')).toBeTruthy();
    });

    it('treats an omitted targetKind as a group invite (the cloud flow never passes one)', () => {
        setup({ placeName: '레몬클라우드' });

        expect(screen.getByTestId('invite-place-card')).toBeTruthy();
        expect(screen.getByText('그룹 대화')).toBeTruthy();
    });

    it('shows the place card for a 1:1 invite too', () => {
        // The gate is the data, not the room kind: a 1:1 invite is still an invite INTO a place, and
        // the 1:1 design node draws the card (reversing ADR-0037 decision 1).
        setup({ targetKind: 'oneToOne', placeName: '레몬클라우드', placeIntro: '함께 일하는 공간' });

        expect(screen.getByTestId('invite-place-card')).toBeTruthy();
        expect(screen.getByText('1:1 대화')).toBeTruthy();
    });

    it('folds the place card away for a 1:1 invite with no place data', () => {
        setup({ targetKind: 'oneToOne' });

        expect(screen.queryByTestId('invite-place-card')).toBeNull();
    });

    it('folds the place card away for a group invite with nothing to show', () => {
        // Asserts on the card, not its copy: with no place props passed, a copy-only assertion would
        // hold even if the gate were removed entirely.
        setup({ targetKind: 'group' });

        expect(screen.queryByTestId('invite-place-card')).toBeNull();
        expect(screen.getByText('그룹 대화')).toBeTruthy();
    });

    it('shows the place card for a group invite carrying only an intro', () => {
        setup({ targetKind: 'group', placeIntro: '함께 일하는 공간' });

        expect(screen.getByTestId('invite-place-card')).toBeTruthy();
        expect(screen.getByText('함께 일하는 공간')).toBeTruthy();
    });

    it('shows the room-friends chip only once a member count arrives', () => {
        const { rerender } = setup({ targetKind: 'group', placeName: 'P' });
        expect(screen.queryByText(/방 친구/)).toBeNull();

        rerender(
            <InviteAcceptScreen
                inviterName="Sunny"
                placeName="P"
                targetKind="group"
                memberCount={20}
                countdown={COUNTDOWN}
                isAccepting={false}
                onAccept={jest.fn()}
                onClose={jest.fn()}
            />
        );
        expect(screen.getByText('방 친구 20')).toBeTruthy();
    });
});

describe('InviteAcceptScreen — shared chrome', () => {
    it('renders the inviter name inside the heading', () => {
        setup({ inviterName: 'Sunny' });
        expect(screen.getByText('Sunny')).toBeTruthy();
    });

    // jsdom has no layout, so this asserts the rule rather than the pixels it prevents. It earns its
    // keep because the pair is load-bearing and non-obvious: the name is free text, `break-keep`
    // makes an unbroken Korean run the heading's min-content width, and the heading sits under
    // `items-center` where it is sized to content — so a long name grew the block past the surface
    // (measured 398px inside a 343px column) and got clipped off-screen. `break-words` was measured
    // and does NOT fix it: `overflow-wrap: break-word` leaves intrinsic sizing alone. Only
    // `anywhere` shrinks min-content, and only when the text would otherwise spill.
    it('국제/장문 이름이 넘치지 않도록 heading이 break-keep과 anywhere를 함께 건다', () => {
        setup({ inviterName: '아주아주아주긴이름을가진사용자님' });

        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading.className).toContain('break-keep');
        expect(heading.className).toContain('[overflow-wrap:anywhere]');
    });

    it('hides the validity card when there is no countdown', () => {
        setup({ countdown: null });
        expect(screen.queryByText('초대 링크 유효시간')).toBeNull();
    });

    it('renders the validity card from the countdown alone', () => {
        setup();
        expect(screen.getByText('01:02:03 남음')).toBeTruthy();
    });

    it('routes decline to onDecline when given, and to onClose otherwise', async () => {
        const onDecline = jest.fn();
        const onClose = jest.fn();
        setup({ onDecline, onClose });

        await userEvent.click(screen.getByText('거절'));
        expect(onDecline).toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});
