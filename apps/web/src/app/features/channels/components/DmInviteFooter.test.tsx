import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, string>) => (vars?.time ? `${key}:${vars.time}` : key),
    }),
}));
jest.mock('@chatic/web-ui-kit', () => ({
    IconChevronRight: () => <span />,
}));

import { DmInviteFooter } from './DmInviteFooter';
import type { InviteCountdown } from '../../invite/hooks/useInviteCountdown';

const countdown = (over: Partial<InviteCountdown> = {}): InviteCountdown => ({
    days: 0,
    hours: 1,
    minutes: 2,
    seconds: 3,
    isExpired: false,
    isImminent: false,
    ...over,
});

const CTA = 'chat.dm.footer.reinvite';

describe('DmInviteFooter', () => {
    it('상대가 있으면 아무것도 렌더하지 않는다', () => {
        const { container } = render(<DmInviteFooter state={{ kind: 'present' }} countdown={null} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('초대가 없으면 안내 문구와 CTA만 보여준다', () => {
        const onReinvite = jest.fn();
        render(<DmInviteFooter state={{ kind: 'absent' }} countdown={null} onReinvite={onReinvite} />);

        expect(screen.getByText('chat.dm.footer.leftHint')).toBeInTheDocument();
        expect(screen.queryByText('chat.dm.footer.inviteSent')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText(CTA));
        expect(onReinvite).toHaveBeenCalled();
    });

    // Doesn't create a second code while one is still alive (Figma 4062-14154 has no button for it).
    it('초대가 살아 있으면 발송 완료 문구와 카운트다운을 보여주고 CTA는 감춘다', () => {
        render(
            <DmInviteFooter state={{ kind: 'pending', expiredAt: 1 }} countdown={countdown()} onReinvite={jest.fn()} />
        );

        expect(screen.getByText('chat.dm.footer.inviteSent')).toBeInTheDocument();
        expect(
            screen.getByText('inviteAccept.expiry.label inviteAccept.expiry.remaining:01:02:03')
        ).toBeInTheDocument();
        expect(screen.queryByText(CTA)).not.toBeInTheDocument();
    });

    it('거절되면 거절 문구 2줄과 CTA를 보여준다', () => {
        render(<DmInviteFooter state={{ kind: 'rejected' }} countdown={null} onReinvite={jest.fn()} />);

        expect(screen.getByText('chat.dm.footer.rejected')).toBeInTheDocument();
        expect(screen.getByText('chat.dm.footer.rejectedHint')).toBeInTheDocument();
        expect(screen.getByText(CTA)).toBeInTheDocument();
    });

    it('만료되면 만료 문구 2줄과 CTA를 보여준다', () => {
        render(
            <DmInviteFooter
                state={{ kind: 'expired', expiredAt: 1 }}
                countdown={countdown({ hours: 0, minutes: 0, seconds: 0, isExpired: true })}
                onReinvite={jest.fn()}
            />
        );

        expect(screen.getByText('chat.dm.footer.expired')).toBeInTheDocument();
        expect(screen.getByText('chat.dm.footer.expiredHint')).toBeInTheDocument();
        expect(screen.getByText(CTA)).toBeInTheDocument();
    });

    it('만료된 남은 시간만 적색으로 그린다', () => {
        const { rerender } = render(
            <DmInviteFooter state={{ kind: 'pending', expiredAt: 1 }} countdown={countdown()} />
        );
        expect(screen.getByText('inviteAccept.expiry.label inviteAccept.expiry.remaining:01:02:03')).toHaveClass(
            'text-point-blue'
        );

        rerender(
            <DmInviteFooter
                state={{ kind: 'expired', expiredAt: 1 }}
                countdown={countdown({ hours: 0, minutes: 0, seconds: 0, isExpired: true })}
            />
        );
        expect(screen.getByText('inviteAccept.expiry.label inviteAccept.expiry.remaining:00:00:00')).toHaveClass(
            'text-destructive'
        );
    });

    // days is always 0 for a 24-hour link, but even if the server hands out a longer link, it must
    // not get squashed down to 00:00:00.
    it('하루가 넘는 링크는 시간으로 접어서 표시한다', () => {
        render(<DmInviteFooter state={{ kind: 'pending', expiredAt: 1 }} countdown={countdown({ days: 3 })} />);

        expect(
            screen.getByText('inviteAccept.expiry.label inviteAccept.expiry.remaining:73:02:03')
        ).toBeInTheDocument();
    });

    it('초대할 수 없는 상태면 CTA를 그리지 않는다', () => {
        render(<DmInviteFooter state={{ kind: 'absent' }} countdown={null} />);

        expect(screen.getByText('chat.dm.footer.leftHint')).toBeInTheDocument();
        expect(screen.queryByText(CTA)).not.toBeInTheDocument();
    });
});
