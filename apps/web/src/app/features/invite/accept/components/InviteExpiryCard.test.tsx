import { render, screen } from '@testing-library/react';

import { InviteExpiryCard } from './InviteExpiryCard';
import type { InviteCountdown } from '../../hooks/useInviteCountdown';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (key === 'inviteAccept.expiry.label') return '초대 링크 유효시간';
            if (key === 'inviteAccept.expiry.remaining') return `${opts?.time} 남음`;
            if (key === 'inviteAccept.expiry.days') return `${opts?.n}일`;
            if (key === 'inviteAccept.expiry.hours') return `${opts?.n}시간`;
            if (key === 'inviteAccept.expiry.minutes') return `${opts?.n}분`;
            return key;
        },
    }),
}));

const countdown = (over: Partial<InviteCountdown> = {}): InviteCountdown => ({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
    isImminent: false,
    ...over,
});

describe('InviteExpiryCard', () => {
    it('reads in words from the first non-zero unit while more than ten minutes remain', () => {
        render(<InviteExpiryCard countdown={countdown({ hours: 3, minutes: 20, seconds: 41 })} />);
        expect(screen.getByText('3시간 20분 남음').className).toContain('text-label');
    });

    it('names every unit from the days down', () => {
        render(<InviteExpiryCard countdown={countdown({ days: 1, hours: 2, minutes: 5 })} />);
        expect(screen.getByText('1일 2시간 5분 남음')).toBeTruthy();
    });

    it('keeps a zero unit after the first non-zero one', () => {
        render(<InviteExpiryCard countdown={countdown({ days: 2, hours: 0, minutes: 40 })} />);
        expect(screen.getByText('2일 0시간 40분 남음')).toBeTruthy();
    });

    it('reads minutes alone under an hour', () => {
        render(<InviteExpiryCard countdown={countdown({ minutes: 45, seconds: 12 })} />);
        expect(screen.getByText('45분 남음')).toBeTruthy();
    });

    it('switches to a spaced red clock inside the last ten minutes', () => {
        render(<InviteExpiryCard countdown={countdown({ minutes: 9, seconds: 5, isImminent: true })} />);
        expect(screen.getByText('00 : 09 : 05 남음').className).toContain('text-destructive');
    });

    it('stays on a red zero clock once expired, where isImminent has already flipped back to false', () => {
        // Guards the pairing with isExpired — on its own, isImminent would let a dead link render in
        // words and in the calm colour.
        render(<InviteExpiryCard countdown={countdown({ isExpired: true, isImminent: false })} />);
        expect(screen.getByText('00 : 00 : 00 남음').className).toContain('text-destructive');
    });

    it('shows the validity label', () => {
        render(<InviteExpiryCard countdown={countdown({ minutes: 30 })} />);
        expect(screen.getByText('초대 링크 유효시간')).toBeTruthy();
    });
});
