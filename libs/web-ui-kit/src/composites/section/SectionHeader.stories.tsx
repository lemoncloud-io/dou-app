import type { Meta, StoryObj } from '@storybook/react';

import { SectionHeader } from '@chatic/web-ui-kit';

const meta: Meta<typeof SectionHeader> = {
    title: 'web-ui-kit/composites/SectionHeader',
    component: SectionHeader,
    args: { title: 'Chat', count: 4 },
    decorators: [
        Story => (
            <div className="w-[358px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof SectionHeader>;

export const Default: Story = {};
export const WithoutCount: Story = { args: { count: undefined } };
