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

// 1:1 chat — peer avatar + name, hugging the back button.
export const Direct: Story = {
    args: {
        kind: 'direct',
        title: '<친구 이름>',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
    },
};

// 1:1 chat, peer has no profile photo yet — falls back to the person glyph.
export const DirectWithDefaultAvatar: Story = {
    args: {
        kind: 'direct',
        title: '<친구 이름>',
    },
};

// Group channel with a thumbnail image supplied by the host.
export const GroupWithThumbnail: Story = {
    args: {
        kind: 'group',
        title: '개발 모임방',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
    },
};

// Group channel with no thumbnail — falls back to the three-person group glyph.
export const GroupWithDefaultAvatar: Story = {
    args: {
        kind: 'group',
        title: '개발 모임방',
    },
};

// Group channel with the participant meta row — owner-first avatar stack + total
// member count under the title (Figma group top bar).
const stackAvatar = (key: string) => <ImageAvatar key={key} src={AVATAR} size={20} className="ring-2 ring-surface" />;
export const GroupWithMemberStack: Story = {
    args: {
        kind: 'group',
        title: '<그룹방 이름>',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
        meta: <AvatarGroup avatars={['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(stackAvatar)} count={50} max={5} />,
    },
};

// Self chat — person glyph + title, overflow button opens a dropdown.
export const SelfWithMenu: Story = {
    args: {
        kind: 'direct',
        title: '나와의 채팅',
        moreMenu: <div className="px-3 py-2 text-sm">설정</div>,
    },
};
