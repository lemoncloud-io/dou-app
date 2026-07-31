import { render, screen } from '@testing-library/react';

import { InviteExpiryCard } from './InviteExpiryCard';
import type { InviteCountdown } from '../../hooks';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (key === 'inviteAccept.expiry.label') return '초대 링크 유효시간';
            if (key === 'inviteAccept.expiry.remaining') return `${opts?.time} 남음`;
            if (key === 'inviteAccept.expiry.days') return `${opts?.n}일`;
            if (key === 'inviteAccept.expiry.hours') return `${opts?.n}시간`;
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
    it('counts down by the second inside the last day', () => {
        render(<InviteExpiryCard countdown={countdown({ hours: 5, minutes: 7, seconds: 9 })} />);
        expect(screen.getByText('05:07:09 남음')).toBeTruthy();
    });

    it('zero-pads every field so the line does not jitter as it ticks', () => {
        render(<InviteExpiryCard countdown={countdown({ hours: 0, minutes: 0, seconds: 3 })} />);
        expect(screen.getByText('00:00:03 남음')).toBeTruthy();
    });

    it('switches to day + hour once more than a day remains', () => {
        // The server issues 3-day links, which HH:mm:ss cannot express (ADR-0037).
        render(<InviteExpiryCard countdown={countdown({ days: 2, hours: 5, minutes: 7, seconds: 9 })} />);
        expect(screen.getByText('2일 5시간 남음')).toBeTruthy();
    });

    it('drops the hour part when it is zero', () => {
        render(<InviteExpiryCard countdown={countdown({ days: 3, hours: 0, minutes: 40 })} />);
        expect(screen.getByText('3일 남음')).toBeTruthy();
    });

    it('reddens the remaining line when expiry is imminent', () => {
        const { rerender } = render(<InviteExpiryCard countdown={countdown({ minutes: 9, isImminent: true })} />);
        expect(screen.getByText('00:09:00 남음').className).toContain('text-destructive');

        rerender(<InviteExpiryCard countdown={countdown({ minutes: 30 })} />);
        expect(screen.getByText('00:30:00 남음').className).toContain('text-label');
    });

    it('stays red once expired, where isImminent has already flipped back to false', () => {
        // Guards the pairing with isExpired — on its own, isImminent would let a dead link render
        // "00:00:00 남음" in the calm colour.
        render(<InviteExpiryCard countdown={countdown({ isExpired: true, isImminent: false })} />);
        expect(screen.getByText('00:00:00 남음').className).toContain('text-destructive');
    });

    it('shows the validity label', () => {
        render(<InviteExpiryCard countdown={countdown({ minutes: 30 })} />);
        expect(screen.getByText('초대 링크 유효시간')).toBeTruthy();
    });
});
