import type { Meta, StoryObj } from '@storybook/react';

import { Button, ButtonGroup } from '@chatic/web-ui-kit';

const meta: Meta<typeof ButtonGroup> = {
    title: 'web-ui-kit/foundations/ButtonGroup',
    component: ButtonGroup,
    decorators: [
        Story => (
            <div className="w-[343px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof ButtonGroup>;

export const CancelConfirm: Story = {
    render: () => (
        <ButtonGroup>
            <Button variant="outline" tone="gray" size="lg">
                취소
            </Button>
            <Button variant="solid" tone="green" size="lg">
                확인
            </Button>
        </ButtonGroup>
    ),
};
