import type { Meta, StoryObj } from '@storybook/react';

import { ReadReceipt } from './index';

const meta: Meta<typeof ReadReceipt> = {
    title: 'web-ui-kit/composites/ReadReceipt',
    component: ReadReceipt,
    args: { readLabel: '읽음', unreadLabel: '미확인', allReadLabel: '모두 읽음' },
};
export default meta;

type Story = StoryObj<typeof ReadReceipt>;

export const PartiallyRead: Story = { args: { readCount: 1, unreadCount: 99 } };
export const SingleUnread: Story = { args: { readCount: 1, unreadCount: 1 } };
export const AllRead: Story = { args: { readCount: 8, unreadCount: 0 } };

export const DmUnread: Story = { args: { mode: 'dm', readCount: 1, unreadCount: 1 } };
export const DmRead: Story = { args: { mode: 'dm', readCount: 2, unreadCount: 0 } };
