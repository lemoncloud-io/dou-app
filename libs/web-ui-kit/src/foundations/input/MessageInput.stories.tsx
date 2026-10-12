import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { ComposerAttachButton, MessageInput } from '@chatic/web-ui-kit';

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

const WithAttachDemo = () => {
    const [value, setValue] = useState('');
    const [open, setOpen] = useState(false);
    return (
        <MessageInput
            value={value}
            onChange={setValue}
            onSend={() => setValue('')}
            leadingSlot={<ComposerAttachButton open={open} onClick={() => setOpen(v => !v)} />}
        />
    );
};

export const WithAttach: Story = { render: () => <WithAttachDemo /> };

/** Photos picked in the attach panel: the send button is live with nothing typed. */
export const SendReady: Story = {
    render: () => <MessageInput value="" onChange={() => undefined} onSend={() => undefined} sendReady />,
};
