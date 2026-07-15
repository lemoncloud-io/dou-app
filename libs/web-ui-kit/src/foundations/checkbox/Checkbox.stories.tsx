import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Checkbox } from '@chatic/web-ui-kit';

const meta: Meta<typeof Checkbox> = {
    title: 'web-ui-kit/foundations/Checkbox',
    component: Checkbox,
};
export default meta;

type Story = StoryObj<typeof Checkbox>;

const Demo = () => {
    const [checked, setChecked] = useState(false);
    return <Checkbox checked={checked} onCheckedChange={setChecked} label="선택" />;
};

export const Interactive: Story = { render: () => <Demo /> };
export const Checked: Story = { args: { checked: true } };
export const Unchecked: Story = { args: { checked: false } };
