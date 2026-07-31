import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { InviteChannelRow } from './InviteChannelRow';

const invite = (overrides: Partial<MyInviteView>): MyInviteView => ({ id: 'invite-1', ...overrides }) as MyInviteView;

describe('InviteChannelRow', () => {
    it('pending invite는 이름과 pending 뱃지 키를 보여준다', () => {
        render(<InviteChannelRow invite={invite({ state: 'pending', name: '홍길동' })} onClick={jest.fn()} />);

        expect(screen.getByText('홍길동')).toBeInTheDocument();
        expect(screen.getByText('contactInvite.badge.pending')).toBeInTheDocument();
    });

    // Figma `1명 Profile`(3209:14450) — 링 있는 brand-ink 원 + solid 실루엣. 기본값 `variant="user"`는
    // 링 없는 lucide 아웃라인이라 조용히 되돌아가도 다른 단정으로는 잡히지 않는다.
    it('아바타로 solid 실루엣 글리프를 쓴다 (lucide 아웃라인이 아니다)', () => {
        const { container } = render(
            <InviteChannelRow invite={invite({ state: 'pending', name: '홍길동' })} onClick={jest.fn()} />
        );
        const avatar = container.querySelector('.bg-brand-ink') as HTMLElement;

        expect(avatar.className).toContain('border-border');
        expect(avatar.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 42 42');
    });

    it('expired invite는 expired 뱃지 키를 보여준다', () => {
        render(<InviteChannelRow invite={invite({ state: 'expired', name: '이순신' })} onClick={jest.fn()} />);

        expect(screen.getByText('contactInvite.badge.expired')).toBeInTheDocument();
    });

    it('이름이 없으면 무명 수신자 문구로 대체한다', () => {
        render(<InviteChannelRow invite={invite({ state: 'pending', name: undefined })} onClick={jest.fn()} />);

        expect(screen.getByText('contactInvite.unnamedRecipient')).toBeInTheDocument();
    });

    it('last4가 있으면 마스킹된 번호 문구를 부제목으로 보여준다', () => {
        render(<InviteChannelRow invite={invite({ state: 'pending', last4: '5678' })} onClick={jest.fn()} />);

        expect(screen.getByText('contactInvite.maskedPhone')).toBeInTheDocument();
    });

    it('행을 탭하면 onClick이 호출된다', () => {
        const onClick = jest.fn();
        render(<InviteChannelRow invite={invite({ state: 'pending', name: '홍길동' })} onClick={onClick} />);

        fireEvent.click(screen.getByText('홍길동'));

        expect(onClick).toHaveBeenCalledTimes(1);
    });
});
