import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { BottomSheet } from '@chatic/web-ui-kit';
import { FloatingButton } from '@chatic/web-ui-kit';
import { SheetOption } from '@chatic/web-ui-kit';

const REASONS = ['괴롭힘 / 따돌림', '혐오 발언', '폭력적 위협', '성적 콘텐츠', '스팸 / 광고', '기타'];

const meta: Meta<typeof BottomSheet> = {
    title: 'web-ui-kit/composites/BottomSheet',
    component: BottomSheet,
};
export default meta;

type Story = StoryObj<typeof BottomSheet>;

const ReportDemo = () => {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('혐오 발언');
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="rounded-lg bg-secondary px-4 py-2 text-[14px] font-semibold text-foreground"
            >
                Open bottom sheet
            </button>
            <BottomSheet
                open={open}
                onOpenChange={setOpen}
                title="신고하기"
                onClose={() => undefined}
                footer={<FloatingButton label="신고" onClick={() => setOpen(false)} />}
            >
                {REASONS.map((r, i) => (
                    <SheetOption
                        key={r}
                        label={r}
                        selected={reason === r}
                        onSelect={() => setReason(r)}
                        showDivider={i < REASONS.length - 1}
                    />
                ))}
            </BottomSheet>
        </>
    );
};

export const ReportReasons: Story = { render: () => <ReportDemo /> };
