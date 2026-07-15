import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { VerificationCodeInput } from '@chatic/web-ui-kit';

const meta: Meta<typeof VerificationCodeInput> = {
    title: 'web-ui-kit/foundations/VerificationCodeInput',
    component: VerificationCodeInput,
    decorators: [
        Story => (
            <div className="w-[343px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof VerificationCodeInput>;

const Demo = ({ error }: { error?: boolean }) => {
    const [value, setValue] = useState('123');
    return <VerificationCodeInput value={value} onChange={setValue} length={6} error={error} />;
};

export const Default: Story = { render: () => <Demo /> };
export const ErrorState: Story = { render: () => <Demo error /> };
