import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AlertDialog } from '@chatic/web-ui-kit';

const meta: Meta<typeof AlertDialog> = {
    title: 'web-ui-kit/composites/AlertDialog',
    component: AlertDialog,
};
export default meta;

type Story = StoryObj<typeof AlertDialog>;

const Trigger = (props: { destructive?: boolean; description?: string; title: string; confirmLabel: string }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold text-foreground"
            >
                Open dialog
            </button>
            <AlertDialog open={open} onOpenChange={setOpen} onConfirm={() => undefined} {...props} />
        </>
    );
};

export const Confirm: Story = {
    render: () => <Trigger title="<친구 이름>님을 신고하시겠습니까?" confirmLabel="신고하기" />,
};

export const Destructive: Story = {
    render: () => (
        <Trigger
            title="1:1 대화방을 나가시겠습니까?"
            description="방을 나가면 더 이상 대화에 참여할 수 없습니다."
            confirmLabel="나가기"
            destructive
        />
    ),
};
