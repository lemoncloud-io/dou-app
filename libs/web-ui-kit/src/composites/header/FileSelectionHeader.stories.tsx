import type { Meta, StoryObj } from '@storybook/react';

import { FileSelectionHeader } from './FileSelectionHeader';

const meta: Meta<typeof FileSelectionHeader> = {
    title: 'web-ui-kit/composites/FileSelectionHeader',
    component: FileSelectionHeader,
    args: {
        title: '항목 선택',
        cancelLabel: '취소',
        toggleAllLabel: '전체 선택',
        onCancel: () => undefined,
        onToggleAll: () => undefined,
        safeArea: false,
    },
    decorators: [
        Story => (
            <div className="w-[375px] bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof FileSelectionHeader>;

/** Figma 6082:23243 — nothing picked yet. */
export const NothingSelected: Story = {};

/** Some picked. */
export const SomeSelected: Story = { args: { title: '2개 선택' } };

/** Everything picked — the right button turns into "deselect all". */
export const AllSelected: Story = { args: { title: '3개 선택', toggleAllLabel: '선택 해제' } };

/** An empty list: nothing to select. */
export const ToggleDisabled: Story = { args: { toggleAllDisabled: true } };
