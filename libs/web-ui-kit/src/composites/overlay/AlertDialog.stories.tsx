import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { AlertDialog } from '@chatic/web-ui-kit';

const meta: Meta<typeof AlertDialog> = {
    title: 'web-ui-kit/composites/AlertDialog',
    component: AlertDialog,
};
export default meta;

type Story = StoryObj<typeof AlertDialog>;

const Trigger = (props: {
    destructive?: boolean;
    description?: string;
    title: string;
    confirmLabel: string;
    cancelLabel?: string;
}) => {
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
    render: () => <Trigger title="<친구 이름>님을 신고하시겠습니까?" cancelLabel="취소" confirmLabel="신고하기" />,
};

export const Destructive: Story = {
    render: () => (
        <Trigger
            title="1:1 대화방을 나가시겠습니까?"
            description="방을 나가면 더 이상 대화에 참여할 수 없습니다."
            cancelLabel="취소"
            confirmLabel="나가기"
            destructive
        />
    ),
};

// Single full-width action — the Figma one-button notice dialog (e.g. an expired invite).
export const SingleAction: Story = {
    render: () => (
        <Trigger
            title="초대 링크가 만료되었어요"
            description="보안을 위해 일정 시간이 지나면 초대 링크는 자동으로 만료됩니다. 초대한 사람에게 새로운 초대를 받아 다시 참여해 주세요."
            confirmLabel="확인"
        />
    ),
};
