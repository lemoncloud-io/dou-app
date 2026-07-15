import type { Meta, StoryObj } from '@storybook/react';

import { Badge } from '@chatic/web-ui-kit';

const meta: Meta<typeof Badge> = {
    title: 'web-ui-kit/foundations/Badge',
    component: Badge,
    args: { children: 'Badge' },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const SolidAccent: Story = { args: { variant: 'solid', tone: 'accent', children: '방장' } };
export const SolidMuted: Story = { args: { variant: 'solid', tone: 'muted', children: '초대 대기 중' } };
export const SolidDark: Story = { args: { variant: 'solid', tone: 'dark', children: 'MY' } };
export const Outline: Story = { args: { variant: 'outline', tone: 'accent', children: 'PRO' } };
