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
