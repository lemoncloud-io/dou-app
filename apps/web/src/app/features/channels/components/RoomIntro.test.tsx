import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: Record<string, string>) => (vars?.name ? `${key}:${vars.name}` : key),
    }),
}));
jest.mock('@chatic/web-ui-kit', () => ({
    SystemMessage: ({ title, description }: any) => (
        <div>
            <p>{title}</p>
            <p>{description}</p>
        </div>
    ),
    IconChevronRight: () => <span />,
}));

import { RoomIntro } from './RoomIntro';

describe('RoomIntro', () => {
    it('self: 나만의 기록 문구를 보여준다', () => {
        render(<RoomIntro variant="self" />);

        expect(screen.getByText('chat.room.emptyState.selfLine1')).toBeInTheDocument();
        expect(screen.getByText('chat.room.emptyState.selfLine2')).toBeInTheDocument();
    });

    it('dm: 상대 프로필 닉으로 입장 문구를 만든다', () => {
        render(<RoomIntro variant="dm" peerNick="토끼" />);

        expect(screen.getByText('chat.dm.intro.title:토끼')).toBeInTheDocument();
        expect(screen.getByText('chat.dm.intro.description')).toBeInTheDocument();
    });

    it('dm: 상대 프로필이 없으면 이름 없는 문구로 떨어진다', () => {
        render(<RoomIntro variant="dm" />);

        expect(screen.getByText('chat.dm.intro.titleUnnamed')).toBeInTheDocument();
    });

    it('group(방장): 생성 문구와 초대 CTA를 보여준다', () => {
        const onInvite = jest.fn();
        render(<RoomIntro variant="group" isGroupOwner onInvite={onInvite} />);

        expect(screen.getByText('chat.room.emptyState.line1')).toBeInTheDocument();
        expect(screen.getByText('chat.room.emptyState.line2')).toBeInTheDocument();

        fireEvent.click(screen.getByText('chat.room.emptyState.inviteButton'));
        expect(onInvite).toHaveBeenCalled();
    });

    it('group(방장): 초대할 수 없는 상태면 문구만 남고 CTA는 빠진다', () => {
        render(<RoomIntro variant="group" isGroupOwner />);

        expect(screen.getByText('chat.room.emptyState.line1')).toBeInTheDocument();
        expect(screen.queryByText('chat.room.emptyState.inviteButton')).not.toBeInTheDocument();
    });

    it('group(참여자): 방장 목소리의 문구이므로 아무것도 렌더하지 않는다', () => {
        const { container } = render(<RoomIntro variant="group" onInvite={jest.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });
});
