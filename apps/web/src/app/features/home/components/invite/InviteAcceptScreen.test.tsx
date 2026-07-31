import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InviteAcceptScreen, type InviteAcceptScreenProps } from './InviteAcceptScreen';
import type { InviteCountdown } from '../../hooks';

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

        expect(screen.getByText('레몬클라우드')).toBeTruthy();
        expect(screen.getByText('함께 일하는 공간')).toBeTruthy();
        expect(screen.getByText('그룹 대화')).toBeTruthy();
    });

    it('treats an omitted targetKind as a group invite (the cloud flow never passes one)', () => {
        setup({ placeName: '레몬클라우드' });

        expect(screen.getByText('레몬클라우드')).toBeTruthy();
        expect(screen.getByText('그룹 대화')).toBeTruthy();
    });

    it('drops the place card entirely for a 1:1 invite, even when place metadata is present', () => {
        // The gate is the room kind, not the data — a 1:1 chat has no place to show (ADR-0037).
        setup({ targetKind: 'oneToOne', placeName: '레몬클라우드', placeIntro: '함께 일하는 공간' });

        expect(screen.queryByText('레몬클라우드')).toBeNull();
        expect(screen.queryByText('함께 일하는 공간')).toBeNull();
        expect(screen.getByText('1:1 대화')).toBeTruthy();
    });

    it('folds the place card away for a group invite with nothing to show', () => {
        setup({ targetKind: 'group' });
        expect(screen.getByText('그룹 대화')).toBeTruthy();
        expect(screen.queryByText('함께 일하는 공간')).toBeNull();
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

    it('hides the decline button when gated off', () => {
        setup({ showDecline: false });
        expect(screen.queryByText('거절')).toBeNull();
        expect(screen.getByText('수락')).toBeTruthy();
    });
});
