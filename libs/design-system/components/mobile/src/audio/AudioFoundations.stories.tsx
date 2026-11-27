import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AudioSeekBar, formatAudioClock, PlaybackRateChip } from './index';

const meta: Meta = { title: 'web-ui-kit/foundations/Audio' };
export default meta;

const RATES = [1, 1.5, 2];

const Demo = ({ tone }: { tone: 'onDark' | 'onLight' }) => {
    const [time, setTime] = useState(723);
    const [preview, setPreview] = useState<number | null>(null);
    const [rate, setRate] = useState(1.5);
    return (
        <div
            className={
                tone === 'onDark'
                    ? 'w-[248px] rounded-[18px] bg-bubble-mine p-4'
                    : 'w-[248px] rounded-[18px] bg-bubble-other p-4'
            }
        >
            <AudioSeekBar value={time} max={2147} onSeek={setTime} onScrub={setPreview} tone={tone} />
            <div className="mt-1.5 flex items-center justify-between">
                <span
                    className={
                        tone === 'onDark'
                            ? 'text-[12px] text-bubble-mine-foreground/75'
                            : 'text-[12px] text-description'
                    }
                >
                    {formatAudioClock(preview ?? time)} / {formatAudioClock(2147)}
                </span>
                <PlaybackRateChip
                    rate={rate}
                    tone={tone}
                    onPress={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}
                />
            </div>
        </div>
    );
};

export const OnDark: StoryObj = { render: () => <Demo tone="onDark" /> };
export const OnLight: StoryObj = { render: () => <Demo tone="onLight" /> };
export const UnknownLength: StoryObj = {
    render: () => (
        <div className="w-[248px]">
            <AudioSeekBar value={0} max={undefined} onSeek={() => undefined} />
        </div>
    ),
};
