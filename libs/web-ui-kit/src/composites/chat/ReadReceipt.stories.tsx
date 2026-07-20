import type { Meta, StoryObj } from '@storybook/react';

import { ReadReceipt } from '@chatic/web-ui-kit';

const meta: Meta<typeof ReadReceipt> = {
    title: 'web-ui-kit/composites/ReadReceipt',
    component: ReadReceipt,
    args: { unreadLabel: '안읽음' },
};
export default meta;

type Story = StoryObj<typeof ReadReceipt>;

// 1:1 chat, peer hasn't read yet.
export const SingleUnread: Story = { args: { unreadCount: 1 } };
// Group chat, several members still unread.
export const GroupUnread: Story = { args: { unreadCount: 12 } };
// Everyone has read — the indicator disappears.
export const AllRead: Story = { args: { unreadCount: 0 } };
