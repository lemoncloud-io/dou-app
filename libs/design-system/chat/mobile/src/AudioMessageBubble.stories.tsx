import { useEffect, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AudioMessageBubble, type AudioMessageBubbleState } from './index';

const meta: Meta<typeof AudioMessageBubble> = {
    title: 'web-ui-kit/composites/AudioMessageBubble',
    component: AudioMessageBubble,
    args: { side: 'mine', state: 'idle', name: '새로운 녹음 8.m4a', meta: '35:47 · 17.0MB' },
};
export default meta;

type Story = StoryObj<typeof AudioMessageBubble>;

const playing = { position: 723, duration: 2147, rate: 1.5 };

export const MineIdle: Story = {};
export const MinePlaying: Story = { args: { state: 'playing', ...playing } };
export const MinePaused: Story = { args: { state: 'paused', ...playing } };
export const MineLoading: Story = { args: { state: 'loading' } };
export const MineSending: Story = {
    args: { state: 'sending', sendProgress: 0.42, sendingText: '업로드 중 42% · 17.0MB' },
};
export const MineSendingUnknown: Story = { args: { state: 'sending', sendingText: '업로드 준비 중' } };
export const MineFailed: Story = { args: { state: 'failed', failedText: '전송하지 못했습니다' } };
export const MineBroken: Story = { args: { state: 'broken', brokenText: '재생할 수 없는 파일입니다' } };
export const MineUnsupported: Story = {
    args: { state: 'unsupported', unsupportedText: '재생 불가 형식 · 17.0MB', onDownload: () => undefined },
};

export const OtherIdle: Story = { args: { side: 'other' } };
export const OtherPlaying: Story = { args: { side: 'other', state: 'playing', ...playing } };
export const OtherPaused: Story = { args: { side: 'other', state: 'paused', ...playing } };
export const OtherLoading: Story = { args: { side: 'other', state: 'loading' } };
export const OtherBroken: Story = {
    args: { side: 'other', state: 'broken', brokenText: '재생할 수 없는 파일입니다' },
};
export const OtherUnsupported: Story = {
    args: {
        side: 'other',
        state: 'unsupported',
        unsupportedText: '재생 불가 형식 · 17.0MB',
        onDownload: () => undefined,
    },
};

export const LongName: Story = {
    args: { side: 'other', name: '팀 회의 1107_최종본_전체녹음_수정_최종_진짜최종.m4a', meta: '1:12:05 · 68.4MB' },
};

const RATES = [1, 1.5, 2];

const Interactive = ({ side }: { side: 'mine' | 'other' }) => {
    const [state, setState] = useState<AudioMessageBubbleState>('idle');
    const [position, setPosition] = useState(0);
    const [rate, setRate] = useState(1);
    const duration = 95;
    useEffect(() => {
        if (state !== 'loading') return;
        const timer = setTimeout(() => setState('playing'), 600);
        return () => clearTimeout(timer);
    }, [state]);
    useEffect(() => {
        if (state !== 'playing') return;
        const timer = setInterval(() => setPosition(value => Math.min(duration, value + rate)), 1000);
        return () => clearInterval(timer);
    }, [state, rate]);
    return (
        <AudioMessageBubble
            side={side}
            state={state}
            name="새로운 녹음 8.m4a"
            meta="1:35 · 1.4MB"
            position={position}
            duration={duration}
            rate={rate}
            onToggle={() => setState(value => (value === 'idle' || value === 'paused' ? 'loading' : 'paused'))}
            onSeek={setPosition}
            onRateChange={() => setRate(value => RATES[(RATES.indexOf(value) + 1) % RATES.length] ?? 1)}
            onOpen={() => undefined}
        />
    );
};
export const InteractiveMine: Story = { render: () => <Interactive side="mine" /> };
export const InteractiveOther: Story = { render: () => <Interactive side="other" /> };
