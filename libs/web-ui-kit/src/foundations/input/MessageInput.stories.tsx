import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { MessageInput } from '@chatic/web-ui-kit';

const meta: Meta<typeof MessageInput> = {
    title: 'web-ui-kit/foundations/MessageInput',
    component: MessageInput,
    decorators: [
        Story => (
            <div className="w-[358px] py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof MessageInput>;

const Demo = ({ initial }: { initial: string }) => {
    const [value, setValue] = useState(initial);
    return <MessageInput value={value} onChange={setValue} onSend={() => setValue('')} />;
};

export const Empty: Story = { render: () => <Demo initial="" /> };
export const MaxHeight: Story = { render: () => <Demo initial={'입력창 Max Height 테스트 '.repeat(8)} /> };
