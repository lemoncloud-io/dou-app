import type { Meta, StoryObj } from '@storybook/react';

import { Button } from '@chatic/web-ui-kit';

const meta: Meta<typeof Button> = {
    title: 'web-ui-kit/foundations/Button',
    component: Button,
    args: { children: '버튼', size: 'lg', fullWidth: true },
    decorators: [
        Story => (
            <div className="w-[343px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof Button>;

export const SolidGreen: Story = { args: { variant: 'solid', tone: 'green' } };
export const SolidBlack: Story = { args: { variant: 'solid', tone: 'black' } };
export const OutlineGreen: Story = { args: { variant: 'outline', tone: 'green' } };
export const OutlineBlack: Story = { args: { variant: 'outline', tone: 'black' } };
export const OutlineGray: Story = { args: { variant: 'outline', tone: 'gray' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Loading: Story = { args: { variant: 'solid', tone: 'green', loading: true } };
export const Disabled: Story = { args: { variant: 'solid', tone: 'green', disabled: true } };
