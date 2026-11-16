import { useEffect, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import {
    AudioDetailLayout,
    type AudioDetailAction,
    formatAudioMeta,
    IconDownload,
    IconMore,
    IconShare,
    Waveform,
} from '../../index';

const meta: Meta<typeof AudioDetailLayout> = {
    title: 'web-ui-kit/composites/AudioDetailLayout',
    component: AudioDetailLayout,
};
export default meta;

type Story = StoryObj<typeof AudioDetailLayout>;

const DURATION = 2147;
const RATES = [1, 1.5, 2];

const ACTIONS: AudioDetailAction[] = [
    { key: 'save', icon: <IconDownload />, label: '저장', onPress: () => undefined },
    { key: 'share', icon: <IconShare />, label: '공유', onPress: () => undefined },
    { key: 'more', icon: <IconMore />, label: '더보기', onPress: () => undefined },
];

const Screen = ({
    initialPosition,
    initialPlaying,
    loading,
}: {
    initialPosition: number;
    initialPlaying: boolean;
    loading?: boolean;
}) => {
    const [position, setPosition] = useState(initialPosition);
    const [playing, setPlaying] = useState(initialPlaying);
    const [rate, setRate] = useState(initialPlaying ? 1.5 : 1);

    // A fake clock so the playing story moves.
    useEffect(() => {
        if (!playing) return;
        const id = window.setInterval(() => setPosition(p => Math.min(p + rate, DURATION)), 1000);
        return () => window.clearInterval(id);
    }, [playing, rate]);

    return (
        <div className="h-[812px] w-[375px] border border-input-border">
            <AudioDetailLayout
                senderName="<친구 이름>"
                sentAt="2026. 11. 11. 오후 6:33"
                onSentAtPress={() => undefined}
                onCollection={() => undefined}
                onBack={() => undefined}
                waveform={
                    <Waveform
                        seed="voice-8"
                        progress={position / DURATION}
                        onSeek={ratio => setPosition(ratio * DURATION)}
                    />
                }
                name="새로운 녹음 8.m4a"
                meta={formatAudioMeta(DURATION, 17.0 * 1024 * 1024)}
                playing={playing}
                loading={loading}
                position={position}
                duration={DURATION}
                rate={rate}
                onToggle={() => setPlaying(p => !p)}
                onSeek={setPosition}
                onSkip={delta => setPosition(p => Math.min(Math.max(p + delta, 0), DURATION))}
                onRateChange={() => setRate(r => RATES[(RATES.indexOf(r) + 1) % RATES.length] ?? 1)}
                actions={ACTIONS}
            />
        </div>
    );
};

// Figma 6066:21958 — before play.
export const BeforePlay: Story = { render: () => <Screen initialPosition={0} initialPlaying={false} /> };

// Figma 6066:22076 — playing, 12:03 of 35:47 at 1.5x.
export const Playing: Story = { render: () => <Screen initialPosition={723} initialPlaying /> };

// Fetching the file before the first play.
export const Loading: Story = { render: () => <Screen initialPosition={0} initialPlaying={false} loading /> };
