import type { Meta, StoryObj } from '@storybook/react';

import { IconAlert, IconClock } from '../../resources/icons';
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

/** Info tone, non-interactive: no chevron, rendered as a plain section. */
export const Info: Story = {};

/** Info tone with `onClick`: the whole card is a button and a chevron trails the title. */
export const Clickable: Story = { args: { onClick: () => undefined } };

/** Danger tone with the D-day chip under the description. */
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

/** The narrowest column the app supports — the title and description wrap, nothing overflows. */
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
