import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { ChannelEmptyState } from './ChannelEmptyState';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe('ChannelEmptyState', () => {
    it('초대받은 플레이스에서는 초대 안내와 플레이스 정보 링크를 보여준다', () => {
        render(<ChannelEmptyState variant="invited" onOpenPlaceInfo={jest.fn()} />);

        expect(screen.getByText('channelList.emptyInvited')).toBeInTheDocument();
        expect(screen.getByText('channelList.emptyInvitedLeaveHint')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'channelList.emptyInvitedPlaceInfo' })).toBeInTheDocument();
    });

    it('플레이스 정보 링크를 누르면 onOpenPlaceInfo를 호출한다', () => {
        const onOpenPlaceInfo = jest.fn();
        render(<ChannelEmptyState variant="invited" onOpenPlaceInfo={onOpenPlaceInfo} />);

        fireEvent.click(screen.getByRole('button', { name: 'channelList.emptyInvitedPlaceInfo' }));
        expect(onOpenPlaceInfo).toHaveBeenCalledTimes(1);
    });

    it('초대받은 플레이스라도 이동할 곳이 없으면 나가기 안내를 숨긴다', () => {
        // No active site id on the host → the settings hub has no route to open, so offering the
        // link would dead-end. Only the "rooms arrive by invitation" line survives.
        render(<ChannelEmptyState variant="invited" />);

        expect(screen.getByText('channelList.emptyInvited')).toBeInTheDocument();
        expect(screen.queryByText('channelList.emptyInvitedLeaveHint')).not.toBeInTheDocument();
    });

    it('소유자에게는 방을 만들라는 기존 문구만 보여준다', () => {
        render(<ChannelEmptyState variant="owner" onOpenPlaceInfo={jest.fn()} />);

        expect(screen.getByText('channelList.empty')).toBeInTheDocument();
        expect(screen.queryByText('channelList.emptyInvitedPlaceInfo')).not.toBeInTheDocument();
    });
});
