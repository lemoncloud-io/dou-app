import type { Meta, StoryObj } from '@storybook/react';

import { CloudAvatar } from '@chatic/web-ui-kit';

const meta: Meta<typeof CloudAvatar> = {
    title: 'web-ui-kit/foundations/CloudAvatar',
    component: CloudAvatar,
};
export default meta;

type Story = StoryObj<typeof CloudAvatar>;

export const Large: Story = { args: { name: '스터디 플레이스', size: 'lg' } };
export const Medium: Story = { args: { name: 'DoU Home', size: 'md' } };
export const Small: Story = { args: { name: 'Sunny Place', size: 'sm' } };

// Different names deterministically land on different tones.
export const Palette: Story = {
    render: () => (
        <div className="flex gap-2">
            {['DoU Home', 'Sunny Place', '스터디 플레이스', 'Team Alpha', 'Book Club', 'Night Owls'].map(name => (
                <CloudAvatar key={name} name={name} />
            ))}
        </div>
    ),
};
