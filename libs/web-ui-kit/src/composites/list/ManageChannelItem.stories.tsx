import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Badge, DefaultAvatar, InviteLinkCard, ManageChannelItem } from '@chatic/web-ui-kit';

const meta: Meta<typeof ManageChannelItem> = {
    title: 'web-ui-kit/composites/ManageChannelItem',
    component: ManageChannelItem,
    decorators: [
        Story => (
            <div className="w-[375px] bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof ManageChannelItem>;

const rooms = [
    { id: 'self', name: 'sunny', preview: '오늘의 할일', self: true },
    { id: 'r1', name: '스터디 모임', preview: '내일 7시에 봐요', unread: 2 },
    { id: 'r2', name: '점심 메뉴', preview: 'Lorem ipsum dolor sit amet consectetur', unread: 10 },
    { id: 'r3', name: '공지방', preview: '' },
];

const ManageList = () => {
    const [selected, setSelected] = useState<Record<string, boolean>>({ r1: true });
    const [pinned, setPinned] = useState<Record<string, boolean>>({ self: true, r2: true });

    return (
        <>
            {rooms.map(room => (
                <ManageChannelItem
                    key={room.id}
                    leading={<DefaultAvatar size={46} variant={room.self ? 'self' : 'user'} />}
                    title={
                        <>
                            {room.self && (
                                <Badge variant="solid" tone="dark" className="px-1.5 py-0.5 text-[11px] leading-none">
                                    MY
                                </Badge>
                            )}
                            <span className="truncate">{room.name}</span>
                        </>
                    }
                    subtitle={room.preview || undefined}
                    time="09:41"
                    unread={room.unread ?? 0}
                    // Self-chat can be neither deleted nor left, so it is not selectable.
                    selectable={!room.self}
                    checked={!!selected[room.id]}
                    onToggle={next => setSelected(s => ({ ...s, [room.id]: next }))}
                    selectLabel={room.name}
                    pinned={!!pinned[room.id]}
                    onTogglePin={next => setPinned(p => ({ ...p, [room.id]: next }))}
                    pinLabel={pinned[room.id] ? '방 고정 해제' : '방 고정'}
                />
            ))}
        </>
    );
};

export const ChannelManageList: Story = { render: () => <ManageList /> };

/** Trailing copy action is an underlined text link (Figma 3266-32893), not an icon button. */
export const InviteLinkCardWithTextCopy: Story = {
    render: () => (
        <div className="p-4">
            <InviteLinkCard name="sunny" url="https://dou.chatic.io/s?code=invt:910001:3f9a8b" copyLabel="링크 복사" />
        </div>
    ),
};
