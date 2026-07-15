import type { Meta, StoryObj } from '@storybook/react';

import { AvatarGroup, ChatRoomHeader } from '@chatic/web-ui-kit';
import { ProfileAvatar } from '@chatic/web-ui-kit';

const memberDot = (color: string, mine = false) => (
    <span
        className={`inline-block size-6 rounded-full border ${mine ? 'border-main-accent' : 'border-surface'}`}
        style={{ background: color }}
    />
);

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

// 1:1 chat — exactly one other participant: peer avatar + name, hugging the back button.
export const Direct: Story = {
    args: {
        kind: 'direct',
        title: '<친구 이름>',
        avatar: <ProfileAvatar src={AVATAR} size={42} />,
    },
};

// 1:1 chat, peer hasn't set a profile photo yet — falls back to the default avatar glyph.
export const DirectWithDefaultAvatar: Story = {
    args: {
        kind: 'direct',
        title: '<친구 이름>',
    },
};

// Group chat (1–n participants) — room name only, centered in the title zone.
export const Group: Story = {
    args: {
        kind: 'group',
        title: '개발 모임방',
    },
};

// Group chat with the member avatar stack + count below the title.
export const GroupWithMembers: Story = {
    args: {
        kind: 'group',
        title: '개발 모임방',
        meta: <AvatarGroup avatars={[memberDot('#5b6b8c', true), memberDot('#8c6b5b')]} count={2} />,
    },
};

// Self chat — title only, but the overflow button is present with a dropdown.
export const SelfWithMenu: Story = {
    args: {
        kind: 'group',
        title: '나와의 채팅',
        moreMenu: <div className="px-3 py-2 text-sm">설정</div>,
    },
};
