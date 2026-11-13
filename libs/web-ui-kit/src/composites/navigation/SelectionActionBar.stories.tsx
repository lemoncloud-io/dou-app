import type { Meta, StoryObj } from '@storybook/react';

import { SelectionActionBar } from './SelectionActionBar';

const meta: Meta<typeof SelectionActionBar> = {
    title: 'web-ui-kit/composites/SelectionActionBar',
    component: SelectionActionBar,
    decorators: [
        Story => (
            <div className="relative h-[240px] w-[375px] overflow-hidden border border-input-border bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof SelectionActionBar>;

export const Default: Story = {
    args: {
        secondary: { label: '읽음으로 표시 1', onClick: () => undefined },
        destructive: { label: '삭제 1', onClick: () => undefined },
    },
};

/** Nothing picked yet — both off. */
export const NothingSelected: Story = {
    args: {
        secondary: { label: '읽음으로 표시', onClick: () => undefined, disabled: true },
        destructive: { label: '삭제', onClick: () => undefined, disabled: true },
    },
};
