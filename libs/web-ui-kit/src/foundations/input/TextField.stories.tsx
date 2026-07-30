import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { TextField } from '@chatic/web-ui-kit';

const meta: Meta<typeof TextField> = {
    title: 'web-ui-kit/foundations/TextField',
    component: TextField,
    decorators: [
        Story => (
            <div className="w-[358px] py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof TextField>;

const DefaultDemo = () => {
    const [value, setValue] = useState('sunny12^^~');
    return (
        <TextField
            label="이름"
            required
            value={value}
            onChange={setValue}
            maxLength={20}
            description="20글자 이내로 입력해 주세요."
        />
    );
};

export const Default: Story = { render: () => <DefaultDemo /> };

export const ErrorState: Story = {
    render: () => <TextField label="이름" required value="" onChange={() => undefined} error="이름을 입력해 주세요." />,
};

const OverLimitDemo = () => {
    // Soft cap: enforceMaxLength={false} keeps the counter but lets the value exceed the max,
    // so the "21/20" over-limit error state is reachable (used by place-profile-create).
    const [value, setValue] = useState('sunny12^^~ㄴㄴㄴㄴㄴㄴㄴㄴㄴㄴ');
    return (
        <TextField
            label="이름"
            required
            value={value}
            onChange={setValue}
            maxLength={20}
            enforceMaxLength={false}
            description="20글자 이내로 입력해 주세요."
            error={value.length > 20 ? '20글자 이내로 입력해 주세요.' : undefined}
        />
    );
};

export const OverLimit: Story = { render: () => <OverLimitDemo /> };

const InlineAction = ({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'ink' | 'muted' }) => (
    <button
        type="button"
        className={`whitespace-nowrap text-[14px] font-medium underline ${
            tone === 'accent' ? 'text-point-blue' : tone === 'ink' ? 'text-foreground' : 'text-placeholder'
        }`}
    >
        {label}
    </button>
);

/** The phone-verification screen's shape: an in-field action plus a countdown on the helper row. */
const WithActionsDemo = () => {
    const [phone, setPhone] = useState('01012345678');
    const [code, setCode] = useState('123456');
    return (
        <div className="flex flex-col gap-6">
            <TextField
                label="휴대폰 번호"
                required
                value={phone}
                onChange={setPhone}
                description="[-]제외, 숫자로만 입력해 주세요."
                trailing={<InlineAction label="인증 요청" />}
            />
            <TextField
                label="인증번호"
                required
                value={code}
                onChange={setCode}
                description="[-]제외, 숫자로만 입력해 주세요."
                trailing={<InlineAction label="재전송" tone="ink" />}
                helperTrailing={
                    <span className="flex items-center gap-[6px] text-[12px] font-medium leading-[18px]">
                        <span className="text-point-blue">02:59</span>
                        <InlineAction label="시간 연장" />
                    </span>
                }
            />
        </div>
    );
};

export const WithInlineActions: Story = { render: () => <WithActionsDemo /> };

export const Success: Story = {
    render: () => (
        <TextField
            label="이름"
            value="sunny"
            onChange={() => undefined}
            success
            description="사용 가능한 이름이에요."
        />
    ),
};
