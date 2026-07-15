import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Switch } from '@chatic/web-ui-kit';

const meta: Meta<typeof Switch> = {
    title: 'web-ui-kit/foundations/Switch',
    component: Switch,
};
export default meta;

type Story = StoryObj<typeof Switch>;

const Demo = () => {
    const [on, setOn] = useState(false);
    return <Switch checked={on} onCheckedChange={setOn} label="대화방 알림" />;
};

export const Interactive: Story = { render: () => <Demo /> };
export const On: Story = { args: { checked: true } };
export const Off: Story = { args: { checked: false } };
