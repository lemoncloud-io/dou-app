import type { Meta, StoryObj } from '@storybook/react';

import { IconButton, IconSearch } from '@chatic/web-ui-kit';

const meta: Meta<typeof IconButton> = {
    title: 'web-ui-kit/foundations/IconButton',
    component: IconButton,
    args: { icon: <IconSearch className="size-[22px]" />, label: '검색' },
};
export default meta;

type Story = StoryObj<typeof IconButton>;

export const Ghost: Story = {};
export const Outline: Story = { args: { variant: 'outline', size: 36 } };
