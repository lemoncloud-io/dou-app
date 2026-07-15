import type { Meta, StoryObj } from '@storybook/react';

import { DateDivider } from '@chatic/web-ui-kit';

const meta: Meta<typeof DateDivider> = {
    title: 'web-ui-kit/composites/DateDivider',
    component: DateDivider,
    args: { label: '2025년 00월 00일 월요일' },
};
export default meta;

type Story = StoryObj<typeof DateDivider>;

export const Default: Story = {};
