import type { Meta, StoryObj } from '@storybook/react';

import { ActivityCountBadge } from './ActivityCountBadge';

const meta: Meta<typeof ActivityCountBadge> = {
    title: 'web-ui-kit/foundations/ActivityCountBadge',
    component: ActivityCountBadge,
};
export default meta;

type Story = StoryObj<typeof ActivityCountBadge>;

/** A row with a mention and two thread replies waiting. */
export const Both: Story = {
    render: () => (
        <div className="flex gap-1">
            <ActivityCountBadge variant="mention" count={1} />
            <ActivityCountBadge variant="thread" count={2} />
        </div>
    ),
};
