import type { Meta, StoryObj } from '@storybook/react';

import { BenefitItem } from '@chatic/web-ui-kit';

const meta: Meta<typeof BenefitItem> = {
    title: 'web-ui-kit/composites/BenefitItem',
    component: BenefitItem,
    args: {
        title: 'title title 가나다',
        description: 'text text text text',
        icon: (
            <span
                role="img"
                aria-label="shop"
                className="flex size-8 items-center justify-center rounded-lg bg-primary/20"
            >
                🛍️
            </span>
        ),
    },
};
export default meta;

type Story = StoryObj<typeof BenefitItem>;

export const Default: Story = {};
