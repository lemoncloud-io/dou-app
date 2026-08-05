import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { ReinviteDialog } from './ReinviteDialog';

describe('ReinviteDialog', () => {
    it('pending 변형은 대기 화면 보기 버튼만 확인 동작으로 갖는다', () => {
        const onViewWaiting = jest.fn();
        const onReissue = jest.fn();
        render(
            <ReinviteDialog
                open
                onOpenChange={jest.fn()}
                variant="pending"
                onViewWaiting={onViewWaiting}
                onReissue={onReissue}
            />
        );

        expect(screen.getByText('contactInvite.reinvite.pending.title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'contactInvite.reinvite.pending.confirm' }));

        expect(onViewWaiting).toHaveBeenCalledTimes(1);
        expect(onReissue).not.toHaveBeenCalled();
    });

    it('expired 변형은 재발급 확인 동작을 갖는다', () => {
        const onViewWaiting = jest.fn();
        const onReissue = jest.fn();
        render(
            <ReinviteDialog
                open
                onOpenChange={jest.fn()}
                variant="expired"
                onViewWaiting={onViewWaiting}
                onReissue={onReissue}
            />
        );

        expect(screen.getByText('contactInvite.reinvite.expired.title')).toBeInTheDocument();
        // Reissuing cancels the prior code server-side first (ADR-0043 결정 5), so there is only
        // one truthful description now — no auto-revoke variant to pick between.
        expect(screen.getByText('contactInvite.reinvite.expired.description')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'contactInvite.reinvite.reissueConfirm' }));

        expect(onReissue).toHaveBeenCalledTimes(1);
        expect(onViewWaiting).not.toHaveBeenCalled();
    });

    it('declined 변형은 거절 카피와 재발급 확인 동작을 갖는다 (ADR-0043 — 이제 도달 가능)', () => {
        const onReissue = jest.fn();
        render(
            <ReinviteDialog
                open
                onOpenChange={jest.fn()}
                variant="declined"
                onViewWaiting={jest.fn()}
                onReissue={onReissue}
            />
        );

        expect(screen.getByText('contactInvite.reinvite.declined.title')).toBeInTheDocument();
        expect(screen.getByText('contactInvite.reinvite.declined.description')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'contactInvite.reinvite.reissueConfirm' }));

        expect(onReissue).toHaveBeenCalledTimes(1);
    });

    it('닫혀 있으면 아무것도 렌더링하지 않는다', () => {
        render(
            <ReinviteDialog
                open={false}
                onOpenChange={jest.fn()}
                variant="pending"
                onViewWaiting={jest.fn()}
                onReissue={jest.fn()}
            />
        );

        expect(screen.queryByText('contactInvite.reinvite.pending.title')).not.toBeInTheDocument();
    });
});
