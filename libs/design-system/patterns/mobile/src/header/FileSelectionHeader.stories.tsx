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

export const NothingSelected: Story = {};

export const SomeSelected: Story = { args: { title: '2개 선택' } };

export const AllSelected: Story = { args: { title: '3개 선택', toggleAllLabel: '선택 해제' } };

export const ToggleDisabled: Story = { args: { toggleAllDisabled: true } };
