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

    // 살아 있는 코드가 하나 있는 동안 두 번째를 만들지 않는다 (Figma 4062-14154에 버튼이 없다).
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

    // 24시간 링크에서는 days가 항상 0이지만, 서버가 더 긴 링크를 주더라도 00:00:00으로
    // 뭉개지지 않아야 한다.
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
