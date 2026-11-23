import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AudioDetailMoreSheet, type AudioDetailMoreSheetProps } from '../../index';

const meta: Meta<typeof AudioDetailMoreSheet> = {
    title: 'web-ui-kit/composites/AudioDetailMoreSheet',
    component: AudioDetailMoreSheet,
};
export default meta;

type Story = StoryObj<typeof AudioDetailMoreSheet>;

const LABELS = { title: '더보기', viewInChat: '대화에서 보기', replyInThread: '스레드에서 답글', delete: '삭제' };

const Trigger = (props: Pick<AudioDetailMoreSheetProps, 'onViewInChat' | 'onReplyInThread' | 'onDelete'>) => {
    const [open, setOpen] = useState(true);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold text-foreground"
            >
                Open sheet
            </button>
            <AudioDetailMoreSheet open={open} onOpenChange={setOpen} labels={LABELS} {...props} />
        </>
    );
};

const noop = () => undefined;

export const AllRows: Story = {
    render: () => <Trigger onViewInChat={noop} onReplyInThread={noop} onDelete={noop} />,
};

export const ViewOnly: Story = { render: () => <Trigger onViewInChat={noop} /> };
