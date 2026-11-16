import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { RoomFilesTabs } from './RoomFilesTabs';

const tabs = [
    { key: 'media', label: '사진·동영상' },
    { key: 'file', label: '파일' },
    { key: 'audio', label: '음성', count: 3 },
    { key: 'link', label: '링크' },
];

const meta: Meta<typeof RoomFilesTabs> = {
    title: 'web-ui-kit/composites/RoomFilesTabs',
    component: RoomFilesTabs,
    args: { tabs, value: 'audio', onChange: () => undefined },
    decorators: [
        Story => (
            <div className="w-[375px] bg-background">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof RoomFilesTabs>;

/** Figma 6072:23221 — the audio tab selected. */
export const Default: Story = {};

/** Selection mode: faded, and tapping another tab does nothing. */
export const Dimmed: Story = { args: { dimmed: true } };

/** Click through the tabs. */
export const Interactive: Story = {
    render: function Render(args) {
        const [value, setValue] = useState('audio');
        return <RoomFilesTabs {...args} value={value} onChange={setValue} />;
    },
};
