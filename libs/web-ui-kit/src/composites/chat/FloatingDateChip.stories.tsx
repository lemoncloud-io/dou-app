import type { Meta, StoryObj } from '@storybook/react';

import { FloatingDateChip } from '@chatic/web-ui-kit';

const meta: Meta<typeof FloatingDateChip> = {
    title: 'web-ui-kit/composites/FloatingDateChip',
    component: FloatingDateChip,
    args: { label: '7. 01 월', visible: true },
    decorators: [
        Story => (
            <div className="flex justify-center bg-background p-6">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof FloatingDateChip>;

export const Visible: Story = {};
export const Hidden: Story = { args: { visible: false } };
