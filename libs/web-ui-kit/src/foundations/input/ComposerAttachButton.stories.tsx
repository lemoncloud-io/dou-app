import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { ComposerAttachButton } from '@chatic/web-ui-kit';

const meta: Meta<typeof ComposerAttachButton> = {
    title: 'web-ui-kit/foundations/ComposerAttachButton',
    component: ComposerAttachButton,
};
export default meta;

type Story = StoryObj<typeof ComposerAttachButton>;

const Demo = () => {
    const [open, setOpen] = useState(false);
    return <ComposerAttachButton open={open} onClick={() => setOpen(v => !v)} />;
};

export const Toggle: Story = { render: () => <Demo /> };
export const Disabled: Story = { args: { open: false, disabled: true, onClick: () => undefined } };
