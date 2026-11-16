import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { IconFilePdf, IconLink } from '../../resources/icons';
import { RoomFileRow } from './RoomFileRow';

const meta: Meta<typeof RoomFileRow> = {
    title: 'web-ui-kit/composites/RoomFileRow',
    component: RoomFileRow,
    args: {
        title: '새로운 녹음 8.m4a',
        subtitle: 'Sunny · 11월 11일 · 35:47 · 17.0MB',
        leading: { kind: 'play', playing: false, onToggle: () => undefined },
        onPress: () => undefined,
        onLongPress: () => undefined,
        onMore: () => undefined,
        playLabel: '재생',
        pauseLabel: '일시정지',
        moreLabel: '더보기',
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

type Story = StoryObj<typeof RoomFileRow>;

/** Figma 6072:23145 — an audio file at rest. */
export const Default: Story = {};

/** Figma 6072:23132 — the one playing, with its position bar. */
export const Playing: Story = {
    args: {
        leading: { kind: 'play', playing: true, onToggle: () => undefined },
        progress: { position: 723, duration: 2147, onSeek: () => undefined, label: '재생 위치' },
    },
};

/** Play, pause and drag the bar. */
export const InteractivePlayback: Story = {
    render: function Render(args) {
        const [playing, setPlaying] = useState(true);
        const [position, setPosition] = useState(723);
        return (
            <RoomFileRow
                {...args}
                leading={{ kind: 'play', playing, onToggle: () => setPlaying(value => !value) }}
                progress={playing ? { position, duration: 2147, onSeek: setPosition } : undefined}
            />
        );
    },
};

/** A document row — the file-kind glyph in the leading tile. */
export const FileRow: Story = {
    args: {
        leading: { kind: 'icon', icon: <IconFilePdf size={24} className="text-alert-red" /> },
        title: '2026 여행 일정표.pdf',
        subtitle: 'Sunny · 11월 10일 · 1.2MB',
    },
};

/** A link row. */
export const LinkRow: Story = {
    args: {
        leading: { kind: 'icon', icon: <IconLink size={22} /> },
        title: 'https://chatic.io/blog/voice-notes',
        subtitle: 'Sunny · 11월 9일',
    },
};

/** Figma 6082:23390 — selection mode, not picked. */
export const SelectionUnselected: Story = {
    args: { selection: { selected: false, onToggle: () => undefined } },
};

/** Figma 6082:23417 — selection mode, picked. */
export const SelectionSelected: Story = {
    args: { selection: { selected: true, onToggle: () => undefined } },
};

/** Tap to toggle in selection mode. */
export const InteractiveSelection: Story = {
    render: function Render(args) {
        const [selected, setSelected] = useState(false);
        return <RoomFileRow {...args} selection={{ selected, onToggle: () => setSelected(value => !value) }} />;
    },
};
