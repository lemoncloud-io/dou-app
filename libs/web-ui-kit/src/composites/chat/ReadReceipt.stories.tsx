import type { Meta, StoryObj } from '@storybook/react';

import { ReadReceipt } from '@chatic/web-ui-kit';

const meta: Meta<typeof ReadReceipt> = {
    title: 'web-ui-kit/composites/ReadReceipt',
    component: ReadReceipt,
    args: { readLabel: '읽음', unreadLabel: '안읽음' },
};
export default meta;

type Story = StoryObj<typeof ReadReceipt>;

// Group chat, one member read, many still unread.
export const PartiallyRead: Story = { args: { readCount: 1, unreadCount: 99 } };
// 1:1 chat, peer hasn't read yet.
export const SingleUnread: Story = { args: { readCount: 1, unreadCount: 1 } };
// Everyone has read — only the read count remains, the unread segment disappears.
export const AllRead: Story = { args: { readCount: 8, unreadCount: 0 } };
