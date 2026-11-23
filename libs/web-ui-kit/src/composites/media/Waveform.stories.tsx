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

export const BeforePlay: Story = {
    render: () => (
        <Frame>
            <Waveform seed="voice-8" progress={0} />
        </Frame>
    ),
};

export const Playing: Story = {
    render: () => (
        <Frame>
            <Waveform seed="voice-8" progress={723 / 2147} />
        </Frame>
    ),
};

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

export const Seekable: Story = { render: () => <SeekDemo /> };
