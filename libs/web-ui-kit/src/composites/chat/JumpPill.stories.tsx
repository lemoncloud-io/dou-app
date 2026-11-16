import type { Meta, StoryObj } from '@storybook/react';

import { JumpPill } from './JumpPill';

const meta: Meta<typeof JumpPill> = {
    title: 'web-ui-kit/composites/JumpPill',
    component: JumpPill,
};
export default meta;

type Story = StoryObj<typeof JumpPill>;

export const Mention: Story = { args: { variant: 'mention', label: '멘션 2', onClick: () => undefined } };
export const Latest: Story = { args: { variant: 'latest', label: '최신 메시지 25', onClick: () => undefined } };
