import type { Meta, StoryObj } from '@storybook/react';

import { Text } from '@chatic/web-ui-kit';

const meta: Meta<typeof Text> = {
    title: 'web-ui-kit/foundations/Text',
    component: Text,
    args: { children: '다람쥐 헌 쳇바퀴에 타고파' },
};
export default meta;

type Story = StoryObj<typeof Text>;

export const Title: Story = { args: { variant: 'title' } };
export const Heading: Story = { args: { variant: 'heading' } };
export const Body: Story = { args: { variant: 'body' } };
export const Callout: Story = { args: { variant: 'callout' } };
export const Caption: Story = { args: { variant: 'caption' } };
export const Label: Story = { args: { variant: 'label' } };
