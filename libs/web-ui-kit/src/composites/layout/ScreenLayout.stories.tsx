import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { FloatingButton } from '@chatic/web-ui-kit';
import { ModalTopBar } from '@chatic/web-ui-kit';
import { ProfileAvatar } from '@chatic/web-ui-kit';
import { TextField } from '@chatic/web-ui-kit';
import { ScreenLayout } from '@chatic/web-ui-kit';

const meta: Meta<typeof ScreenLayout> = {
    title: 'web-ui-kit/composites/ScreenLayout',
    component: ScreenLayout,
    // Constrain height so the full-height scaffold has room to lay out in the canvas.
    decorators: [
        Story => (
            <div className="h-[720px] w-[390px] overflow-hidden border border-input-border">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof ScreenLayout>;

/**
 * Profile-setup screen (Figma 2891:19824) built purely by composing DS
 * components into the layout slots — header, avatar, text input, footer — with
 * no bespoke screen component.
 */
const ProfileSetup = () => {
    const [name, setName] = useState('');
    const valid = name.trim().length > 0;
    return (
        <ScreenLayout
            header={<ModalTopBar title="프로필 설정" onClose={() => undefined} safeArea={false} />}
            footer={<FloatingButton label="완료" disabled={!valid} />}
        >
            <div className="flex flex-col gap-8 px-4 pt-4">
                <div className="flex flex-col">
                    <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                        &lt;플레이스&gt;에서 사용할 이름과
                    </span>
                    <span className="text-[21px] font-semibold leading-[1.35] tracking-[-0.025em] text-foreground">
                        사진을 설정해 주세요
                    </span>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <ProfileAvatar onSelect={() => undefined} />
                    <div className="flex flex-col items-center">
                        <span className="text-[14px] font-medium text-label">프로필 사진</span>
                        <span className="text-[14px] text-description">[선택]</span>
                    </div>
                </div>

                <TextField
                    label="이름"
                    required
                    value={name}
                    onChange={setName}
                    maxLength={20}
                    placeholder="이름 입력"
                    description="20글자 이내로 입력해 주세요."
                />
            </div>
        </ScreenLayout>
    );
};

export const Composed: Story = { render: () => <ProfileSetup /> };

export const HeaderBodyFooter: Story = {
    render: () => (
        <ScreenLayout
            header={<ModalTopBar title="Header" onClose={() => undefined} safeArea={false} />}
            footer={<FloatingButton label="완료" />}
        >
            <div className="space-y-2 p-4">
                {Array.from({ length: 20 }).map((_, i) => (
                    <p key={i} className="text-foreground">
                        스크롤 가능한 본문 {i + 1}
                    </p>
                ))}
            </div>
        </ScreenLayout>
    ),
};
