import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import {
    IconBellOff,
    IconLeave,
    IconPin,
    IconTrash,
    ListRow,
    SwipeActionRow,
    type SwipeSide,
} from '@chatic/web-ui-kit';

const meta: Meta<typeof SwipeActionRow> = {
    title: 'web-ui-kit/composites/SwipeActionRow',
    component: SwipeActionRow,
    // Touch-only gesture: open the canvas in a touch-emulating viewport (device toolbar) to swipe.
    decorators: [
        Story => (
            <div className="w-[390px] border border-input-border">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof SwipeActionRow>;

const ROWS = ['디자인 팀', '주말 등산', '나와의 채팅'];

/** Three rows sharing one open slot, the way a list host holds it. */
const List = ({ destructiveLabel }: { destructiveLabel: '나가기' | '삭제' }) => {
    const [open, setOpen] = React.useState<{ row: string; side: SwipeSide } | null>(null);
    return (
        <>
            {ROWS.map(row => (
                <SwipeActionRow
                    key={row}
                    open={open?.row === row ? open.side : null}
                    onOpenChange={side => setOpen(side ? { row, side } : null)}
                    leadingActions={[
                        {
                            key: 'pin',
                            label: '고정',
                            tone: 'accent',
                            icon: <IconPin size={18} filled />,
                            onSelect: () => undefined,
                        },
                    ]}
                    trailingActions={[
                        {
                            key: 'mute',
                            label: '알림 끄기',
                            tone: 'neutral',
                            icon: <IconBellOff className="size-[18px]" />,
                            onSelect: () => undefined,
                        },
                        {
                            key: 'remove',
                            label: destructiveLabel,
                            tone: 'destructive',
                            icon:
                                destructiveLabel === '삭제' ? (
                                    <IconTrash className="size-[18px]" />
                                ) : (
                                    <IconLeave className="size-[18px]" />
                                ),
                            onSelect: () => undefined,
                        },
                    ]}
                >
                    <ListRow title={row} subtitle="마지막 메시지 미리보기" onClick={() => undefined} />
                </SwipeActionRow>
            ))}
        </>
    );
};

export const MemberRows: Story = { render: () => <List destructiveLabel="나가기" /> };

export const OwnerRows: Story = { render: () => <List destructiveLabel="삭제" /> };

/** Opened from the story, so the trailing tray is visible without a touch device. */
export const OpenTrailing: Story = {
    render: () => (
        <SwipeActionRow
            open="trailing"
            trailingActions={[
                {
                    key: 'mute',
                    label: '알림 끄기',
                    tone: 'neutral',
                    icon: <IconBellOff className="size-[18px]" />,
                    onSelect: () => undefined,
                },
                {
                    key: 'leave',
                    label: '나가기',
                    tone: 'destructive',
                    icon: <IconLeave className="size-[18px]" />,
                    onSelect: () => undefined,
                },
            ]}
        >
            <ListRow title="디자인 팀" subtitle="마지막 메시지 미리보기" onClick={() => undefined} />
        </SwipeActionRow>
    ),
};
