import { type ReactNode, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { decorativeWaveform, Waveform } from '../../index';

const meta: Meta<typeof Waveform> = {
    title: 'web-ui-kit/composites/Waveform',
    component: Waveform,
};
export default meta;

type Story = StoryObj<typeof Waveform>;

const Frame = ({ children }: { children: ReactNode }) => (
    <div className="flex w-[375px] justify-center bg-surface py-6">{children}</div>
);

// Figma 6072:22400 — nothing has played, every bar is idle.
export const BeforePlay: Story = {
    render: () => (
        <Frame>
            <Waveform seed="voice-8" progress={0} />
        </Frame>
    ),
};

// Figma 6072:22439 — a third played (12:03 of 35:47).
export const Playing: Story = {
    render: () => (
        <Frame>
            <Waveform seed="voice-8" progress={723 / 2147} />
        </Frame>
    ),
};

// Measured bars from the host rather than the seeded placeholder.
export const MeasuredBars: Story = {
    render: () => (
        <Frame>
            <Waveform bars={decorativeWaveform('measured', 48).map(h => h * 0.8)} progress={0.5} />
        </Frame>
    ),
};

const SeekDemo = () => {
    const [progress, setProgress] = useState(0.25);
    return (
        <Frame>
            <Waveform seed="voice-8" progress={progress} onSeek={setProgress} label="파형" />
        </Frame>
    );
};

// Tap or drag across the bars, or focus and use the arrow keys.
export const Seekable: Story = { render: () => <SeekDemo /> };
