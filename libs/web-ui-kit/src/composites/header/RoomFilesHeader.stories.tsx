import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { RoomFilesHeader } from '../../index';

const meta: Meta<typeof RoomFilesHeader> = {
    title: 'web-ui-kit/composites/RoomFilesHeader',
    component: RoomFilesHeader,
    parameters: { layout: 'fullscreen' },
    args: {
        title: '대화방 파일',
        actionLabel: '선택',
        onBack: () => undefined,
        onSearch: () => undefined,
        onAction: () => undefined,
        safeArea: false,
    },
};
export default meta;

type Story = StoryObj<typeof RoomFilesHeader>;

/** Figma 6067:22438. */
export const Default: Story = {};

/** The search field below it is open. */
export const Searching: Story = { args: { searchActive: true } };

/** Nothing to select yet. */
export const NothingToSelect: Story = { args: { actionDisabled: true } };

/** A long title truncates before it reaches either side. */
export const LongTitle: Story = { args: { title: '아주 긴 대화방 이름의 대화방 파일 목록 화면 제목' } };

export const Interactive: Story = {
    render: function Render(args) {
        const [open, setOpen] = useState(false);
        return <RoomFilesHeader {...args} searchActive={open} onSearch={() => setOpen(value => !value)} />;
    },
};
