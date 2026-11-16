import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AudioSendSheet, type AudioSendSheetItem } from '../../index';

const meta: Meta<typeof AudioSendSheet> = {
    title: 'web-ui-kit/composites/AudioSendSheet',
    component: AudioSendSheet,
};
export default meta;

type Story = StoryObj<typeof AudioSendSheet>;

const ITEMS: AudioSendSheetItem[] = [
    { key: 'a', name: '새로운 녹음 8.m4a', meta: '35:47 · 17.0MB' },
    { key: 'b', name: '팀 회의 1107_최종본_전체녹음_수정.m4a', meta: '1:12:05 · 68.4MB' },
];

/** Figma 6072:22979. Remove a row; the host closes the sheet when the last one goes. */
const Demo = ({ initial }: { initial: AudioSendSheetItem[] }) => {
    const [open, setOpen] = useState(true);
    const [items, setItems] = useState(initial);
    return (
        <>
            <button
                onClick={() => {
                    setItems(initial);
                    setOpen(true);
                }}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold"
            >
                Open send sheet
            </button>
            <AudioSendSheet
                open={open}
                onOpenChange={setOpen}
                items={items}
                title={`음성 파일 ${items.length}개 보내기`}
                sendLabel={`${items.length}개 보내기`}
                cancelLabel="취소"
                removeLabel={name => `${name} 빼기`}
                onRemove={key => {
                    const next = items.filter(item => item.key !== key);
                    setItems(next);
                    if (next.length === 0) setOpen(false);
                }}
                onCancel={() => setOpen(false)}
                onSend={() => setOpen(false)}
            />
        </>
    );
};

export const TwoFiles: Story = { render: () => <Demo initial={ITEMS} /> };
export const OneFile: Story = { render: () => <Demo initial={ITEMS.slice(0, 1)} /> };
