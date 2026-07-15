import type { Meta, StoryObj } from '@storybook/react';

import { IconChevronRight, IconPlan } from '@chatic/web-ui-kit';
import { OutlineButton } from '@chatic/web-ui-kit';

const meta: Meta<typeof OutlineButton> = {
    title: 'web-ui-kit/foundations/OutlineButton',
    component: OutlineButton,
    args: { children: '버튼' },
};
export default meta;

type Story = StoryObj<typeof OutlineButton>;

export const Default: Story = {};
export const WithIcon: Story = { args: { icon: <IconPlan className="size-4" /> } };
export const Accent: Story = { args: { accent: true, icon: <IconPlan className="size-4" /> } };
export const Medium: Story = {
    args: { size: 'md', children: '초대 다시 보내기', trailingIcon: <IconChevronRight className="size-[18px]" /> },
};
