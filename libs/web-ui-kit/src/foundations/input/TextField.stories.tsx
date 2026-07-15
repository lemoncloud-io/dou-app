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
