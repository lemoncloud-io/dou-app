import type { Meta, StoryObj } from '@storybook/react';

import { CollapsibleSection, ListRow } from '@chatic/web-ui-kit';

const meta: Meta<typeof CollapsibleSection> = {
    title: 'web-ui-kit/composites/CollapsibleSection',
    component: CollapsibleSection,
    args: {
        title: 'Place',
        children: (
            <>
                <ListRow title="DoU Home" subtitle="기본 플레이스" />
                <ListRow title="Sunny Place" subtitle="내 플레이스" />
            </>
        ),
    },
    decorators: [
        Story => (
            <div className="w-[375px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof CollapsibleSection>;

export const Open: Story = {};
export const Collapsed: Story = { args: { defaultOpen: false } };
export const WithCount: Story = { args: { title: 'Chat', count: 4 } };
