import type { Meta, StoryObj } from '@storybook/react';

import { IconAlert, IconClock } from '@chatic/design-system-assets/icons';
import { StatusBanner } from './StatusBanner';

const meta: Meta<typeof StatusBanner> = {
    title: 'web-ui-kit/composites/StatusBanner',
    component: StatusBanner,
    decorators: [
        Story => (
            <div className="w-[375px] bg-background p-4">
                <Story />
            </div>
        ),
    ],
    args: {
        icon: <IconClock className="size-6 text-point-blue" />,
        title: 'Your subscription is active',
        description: 'Next payment on Oct 30, 2026',
    },
};
export default meta;

type Story = StoryObj<typeof StatusBanner>;

export const Info: Story = {};

export const Clickable: Story = { args: { onClick: () => undefined } };

export const DangerWithChip: Story = {
    args: {
        icon: <IconAlert className="size-6 text-destructive" />,
        title: 'Your subscription is ending',
        description: 'Clouds over the free limit will be locked after it ends.',
        tone: 'danger',
        chip: 'D-3 until it ends',
        onClick: () => undefined,
    },
};

export const Narrow320: Story = {
    decorators: [
        Story => (
            <div className="w-[320px] bg-background p-4">
                <Story />
            </div>
        ),
    ],
    args: {
        title: 'A considerably longer status headline that has to wrap',
        chip: 'D-3 until it ends',
        onClick: () => undefined,
    },
};

export const WithAction: Story = {
    args: {
        title: 'Changes apply from the next billing date',
        description: 'From 2026-11-30 your plan becomes DoU Pro 1. Until then nothing changes.',
        onClick: () => undefined,
        action: { label: 'Choose the clouds to keep', onClick: () => undefined },
    },
};
