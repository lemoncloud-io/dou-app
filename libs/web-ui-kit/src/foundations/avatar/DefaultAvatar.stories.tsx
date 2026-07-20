import type { Meta, StoryObj } from '@storybook/react';

import { DefaultAvatar } from '@chatic/web-ui-kit';

const meta: Meta<typeof DefaultAvatar> = {
    title: 'web-ui-kit/foundations/DefaultAvatar',
    component: DefaultAvatar,
};
export default meta;

type Story = StoryObj<typeof DefaultAvatar>;

export const AppHeaderSize: Story = { args: { size: 36 } };
export const ChatRoomHeaderSize: Story = { args: { size: 42 } };
export const GroupChannel: Story = { args: { size: 42, variant: 'group' } };
export const SelfChat: Story = { args: { size: 42, variant: 'self' } };
