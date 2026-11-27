import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { type UnsendableFile, UnsendableFilesDialog } from './index';

const meta: Meta<typeof UnsendableFilesDialog> = {
    title: 'web-ui-kit/composites/UnsendableFilesDialog',
    component: UnsendableFilesDialog,
};
export default meta;

type Story = StoryObj<typeof UnsendableFilesDialog>;

const Trigger = ({ items, restCount }: { items: UnsendableFile[]; restCount: number }) => {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold text-foreground"
            >
                Open dialog
            </button>
            <UnsendableFilesDialog
                open={open}
                onOpenChange={setOpen}
                items={items}
                restCount={restCount}
                title="보낼 수 없는 파일이 있습니다"
                description={'파일 하나는 300MB까지 보낼 수 있습니다.\n아래 파일을 빼고 나머지를 보낼까요?'}
                cancelLabel="취소"
                sendRestLabel={`${restCount}개만 보내기`}
                confirmLabel="확인"
            />
        </>
    );
};

export const SomeLeft: Story = {
    render: () => <Trigger items={[{ key: 'a', name: '워크숍 전체 녹음.wav', reason: '412MB' }]} restCount={1} />,
};

export const ManyRefused: Story = {
    render: () => (
        <Trigger
            items={[
                { key: 'a', name: '워크숍 전체 녹음.wav', reason: '412MB' },
                { key: 'b', name: '이사회 회의 녹음_2026_11_07_오후_전체본.m4a', reason: '388MB' },
                { key: 'c', name: '현장 인터뷰.aiff', reason: '521MB' },
                { key: 'd', name: '세미나.wav', reason: '640MB' },
                { key: 'e', name: '강연 원본.wav', reason: '702MB' },
            ]}
            restCount={2}
        />
    ),
};

export const NoneLeft: Story = {
    render: () => <Trigger items={[{ key: 'a', name: '워크숍 전체 녹음.wav', reason: '412MB' }]} restCount={0} />,
};
