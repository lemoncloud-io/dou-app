import type { Meta, StoryObj } from '@storybook/react';

import { AvatarGroup, ChatRoomHeader, ImageAvatar } from '@chatic/web-ui-kit';
import { ProfileAvatar } from '@chatic/web-ui-kit';

const AVATAR =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42"><rect width="42" height="42" fill="#102346"/></svg>'
    );

const meta: Meta<typeof ChatRoomHeader> = {
    title: 'web-ui-kit/composites/ChatRoomHeader',
    component: ChatRoomHeader,
    args: {
        onBack: () => undefined,
        onMore: () => undefined,
        safeArea: false,
    },
    decorators: [
        Story => (
            <div className="w-[375px] border border-input-border">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof ChatRoomHeader>;

export const Direct: Story = {
    args: {
        kind: 'direct',
        title: '<친구 이름>',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
    },
};

export const DirectWithDefaultAvatar: Story = {
    args: {
        kind: 'direct',
        title: '<친구 이름>',
    },
};

export const GroupWithThumbnail: Story = {
    args: {
        kind: 'group',
        title: '개발 모임방',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
    },
};

export const GroupWithDefaultAvatar: Story = {
    args: {
        kind: 'group',
        title: '개발 모임방',
    },
};

const stackAvatar = (key: string) => <ImageAvatar key={key} src={AVATAR} size={20} className="ring-2 ring-surface" />;
export const GroupWithMemberStack: Story = {
    args: {
        kind: 'group',
        title: '<그룹방 이름>',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
        meta: <AvatarGroup avatars={['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(stackAvatar)} count={50} max={5} />,
    },
};

export const DirectOpensProfile: Story = {
    args: {
        kind: 'direct',
        title: '<친구 이름>',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
        onIdentityClick: () => undefined,
        identityLabel: 'View profile',
    },
};

export const GroupStackOpensMembers: Story = {
    args: {
        kind: 'group',
        title: '<그룹방 이름>',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
        meta: <AvatarGroup avatars={['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(stackAvatar)} count={50} max={5} />,
        onMetaClick: () => undefined,
        metaLabel: 'View members',
    },
};

export const SelfWithMenu: Story = {
    args: {
        kind: 'self',
        title: '나와의 채팅',
        moreMenu: <div className="px-3 py-2 text-sm">설정</div>,
    },
};
