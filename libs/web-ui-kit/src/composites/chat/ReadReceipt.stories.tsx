import type { Meta, StoryObj } from '@storybook/react';

import { ReadReceipt } from '@chatic/web-ui-kit';

const meta: Meta<typeof ReadReceipt> = {
    title: 'web-ui-kit/composites/ReadReceipt',
    component: ReadReceipt,
    args: { readLabel: '읽음', unreadLabel: '안읽음' },
};
export default meta;

type Story = StoryObj<typeof ReadReceipt>;

export const BinaryRead: Story = { args: { variant: 'binary', readCount: 2, unreadCount: 0 } };
export const BinaryUnread: Story = { args: { variant: 'binary', readCount: 1, unreadCount: 1 } };
export const CountPartial: Story = { args: { variant: 'count', readCount: 1, unreadCount: 99 } };
export const CountAllRead: Story = { args: { variant: 'count', readCount: 100, unreadCount: 0 } };
