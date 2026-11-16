import { useEffect, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { MiniAudioPlayer } from '../../index';

const meta: Meta<typeof MiniAudioPlayer> = {
    title: 'web-ui-kit/composites/MiniAudioPlayer',
    component: MiniAudioPlayer,
    args: {
        name: '새로운 녹음 8.m4a',
        sender: '김민지',
        position: 723,
        duration: 2147,
        rate: 1.5,
        onToggle: () => undefined,
        onClose: () => undefined,
        onPress: () => undefined,
    },
};
export default meta;

type Story = StoryObj<typeof MiniAudioPlayer>;

/** Figma 6072:23032. */
export const Playing: Story = { args: { playing: true } };
export const Paused: Story = { args: { playing: false } };
/** A name too long for the bar is cut at the end. */
export const LongName: Story = {
    args: {
        playing: true,
        name: '팀 회의 1107_최종본_전체녹음_수정_최종_진짜최종.m4a',
        position: 4325,
        duration: 4325,
    },
};
/** The host words the line itself. */
export const CustomSubtitle: Story = { args: { playing: true, subtitle: '나와의 채팅 · 12:03 / 35:47' } };

const RATES = [1, 1.5, 2];

const Interactive = () => {
    const [playing, setPlaying] = useState(true);
    const [position, setPosition] = useState(0);
    const [rate, setRate] = useState(1);
    useEffect(() => {
        if (!playing) return;
        const timer = setInterval(() => setPosition(value => value + rate), 1000);
        return () => clearInterval(timer);
    }, [playing, rate]);
    return (
        <MiniAudioPlayer
            name="새로운 녹음 8.m4a"
            sender="김민지"
            playing={playing}
            position={position}
            duration={2147}
            rate={rate}
            onToggle={() => setPlaying(value => !value)}
            onRateChange={() => setRate(value => RATES[(RATES.indexOf(value) + 1) % RATES.length] ?? 1)}
            onClose={() => setPlaying(false)}
        />
    );
};
export const InteractivePlayer: Story = { render: () => <Interactive /> };
