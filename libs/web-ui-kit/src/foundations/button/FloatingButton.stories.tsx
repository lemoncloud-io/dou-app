import type { Meta, StoryObj } from '@storybook/react';

import { FloatingButton, TextLink } from '@chatic/web-ui-kit';

const meta: Meta<typeof FloatingButton> = {
    title: 'web-ui-kit/foundations/FloatingButton',
    component: FloatingButton,
    args: { label: '완료' },
    decorators: [
        Story => (
            <div className="w-[375px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof FloatingButton>;

export const Green: Story = { args: { tone: 'green' } };
export const Black: Story = { args: { tone: 'black', label: '구독하기' } };
export const WithLink: Story = {
    args: { tone: 'green', label: '구독하기', link: <TextLink>다음에 하기</TextLink> },
};
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true } };
