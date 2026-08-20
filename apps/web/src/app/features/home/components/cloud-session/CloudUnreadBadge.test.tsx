import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import type { DomainCloud } from '@chatic/data';

import { CloudUnreadBadge } from './CloudUnreadBadge';
import { DouHomeItem } from './DouHomeItem';
import { InviteCloudItem } from './InviteCloudItem';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe('CloudUnreadBadge — 스위처 읽지 않음 뱃지 (Figma 4147:24964)', () => {
    it('"N"은 장식 글리프이므로 접근성 이름은 i18n 라벨에서 온다', () => {
        render(<CloudUnreadBadge />);

        // The screen reader must get "읽지 않음"/"Unread", never the bare letter.
        const badge = screen.getByRole('status', { name: 'cloudSessionSheet.unreadBadge' });
        expect(badge).toHaveTextContent('N');
        expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull();
    });

    it('20×20 핑크 디스크 토큰을 쓰고 절대 줄어들지 않는다', () => {
        render(<CloudUnreadBadge />);

        // `bg-point-pink` is the token for Figma Colors/Pink (#FF2D55) — no raw hex.
        // `shrink-0` keeps the badge whole while the name truncates (Figma 3486:25664).
        expect(screen.getByRole('status')).toHaveClass('size-5', 'rounded-full', 'bg-point-pink', 'shrink-0');
    });
});

describe('스위처 행들이 하나의 뱃지 컴포넌트를 공유한다', () => {
    const inviteCloud = { id: 'i1', cid: 'i1', name: 'Lemon Cloud' } as DomainCloud;

    it('hasUnread가 켜졌을 때만 뱃지를 그린다 (DoU Home 행)', () => {
        const { rerender } = render(<DouHomeItem isSelected={false} isDisabled={false} onSelect={jest.fn()} />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        rerender(<DouHomeItem isSelected={false} isDisabled={false} hasUnread onSelect={jest.fn()} />);
        expect(screen.getByRole('status', { name: 'cloudSessionSheet.unreadBadge' })).toBeInTheDocument();
    });

    it('hasUnread가 켜졌을 때만 뱃지를 그린다 (초대받은 클라우드 행)', () => {
        const { rerender } = render(
            <InviteCloudItem
                inviteCloud={inviteCloud}
                isSelected={false}
                isDisabled={false}
                onSelectCloud={jest.fn()}
            />
        );
        expect(screen.queryByRole('status')).not.toBeInTheDocument();

        rerender(
            <InviteCloudItem
                inviteCloud={inviteCloud}
                isSelected={false}
                isDisabled={false}
                hasUnread
                onSelectCloud={jest.fn()}
            />
        );
        expect(screen.getByRole('status', { name: 'cloudSessionSheet.unreadBadge' })).toBeInTheDocument();
    });

    it('이름이 truncate 대상이고 뱃지는 그 형제로 남는다 (긴 이름 행)', () => {
        render(<DouHomeItem isSelected={false} isDisabled={false} hasUnread onSelect={jest.fn()} />);

        const label = screen.getByText('cloudSessionSheet.douHome');
        expect(label).toHaveClass('truncate');
        // The truncating label and the badge share a `min-w-0` row, so overflow lands on the name.
        expect(label.parentElement?.className).toContain('min-w-0');
        expect(label.parentElement).toContainElement(screen.getByRole('status'));
    });
});
