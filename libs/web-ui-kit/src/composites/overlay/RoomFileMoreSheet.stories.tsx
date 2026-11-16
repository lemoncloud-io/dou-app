import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { RoomFileMoreSheet, type RoomFileMoreAction } from '../../index';

const meta: Meta<typeof RoomFileMoreSheet> = {
    title: 'web-ui-kit/composites/RoomFileMoreSheet',
    component: RoomFileMoreSheet,
};
export default meta;

type Story = StoryObj<typeof RoomFileMoreSheet>;

const noop = () => undefined;

const Trigger = ({ actions }: { actions: RoomFileMoreAction[] }) => {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold text-foreground"
            >
                Open sheet
            </button>
            <RoomFileMoreSheet
                open={open}
                onOpenChange={setOpen}
                name="팀 회의 1107_최종본_전체녹음_수정.m4a"
                meta="나 · 11월 7일 · 1:12:05 · 68.4MB"
                actions={actions}
            />
        </>
    );
};

// Figma 6082:23508 "종류=일반", without the forward-to-DoU row.
export const Regular: Story = {
    render: () => (
        <Trigger
            actions={[
                { key: 'details', label: '상세 보기', onPress: noop },
                { key: 'chat', label: '대화에서 보기', onPress: noop },
                { key: 'save', label: '저장', onPress: noop },
                { key: 'share', label: '외부 공유', onPress: noop },
                { key: 'delete', label: '삭제', onPress: noop, destructive: true },
            ]}
        />
    ),
};

// Someone else's file: no delete row.
export const NotMine: Story = {
    render: () => (
        <Trigger
            actions={[
                { key: 'details', label: '상세 보기', onPress: noop },
                { key: 'chat', label: '대화에서 보기', onPress: noop },
                { key: 'save', label: '저장', onPress: noop },
                { key: 'share', label: '외부 공유', onPress: noop },
            ]}
        />
    ),
};
