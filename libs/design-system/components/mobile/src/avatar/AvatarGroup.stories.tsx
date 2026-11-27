import type { Meta, StoryObj } from '@storybook/react';

import { AvatarGroup } from './index';

const dot = (color: string, mine = false) => (
    <span
        className={`inline-block size-6 rounded-full border ${mine ? 'border-main-accent' : 'border-surface'}`}
        style={{ background: color }}
    />
);

const meta: Meta<typeof AvatarGroup> = {
    title: 'web-ui-kit/foundations/AvatarGroup',
    component: AvatarGroup,
};
export default meta;

type Story = StoryObj<typeof AvatarGroup>;

export const TwoMembers: Story = {
    args: { avatars: [dot('#5b6b8c', true), dot('#8c6b5b')], count: 2 },
};

export const ManyMembers: Story = {
    args: {
        avatars: [dot('#5b6b8c', true), dot('#8c6b5b'), dot('#5b8c6b'), dot('#8c8c5b'), dot('#6b5b8c')],
        count: 22,
    },
};

export const OnlyMe: Story = {
    args: { avatars: [], count: 1 },
};
