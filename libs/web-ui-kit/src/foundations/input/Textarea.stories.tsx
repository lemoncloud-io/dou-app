import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Textarea } from '@chatic/web-ui-kit';

const meta: Meta<typeof Textarea> = {
    title: 'web-ui-kit/foundations/Textarea',
    component: Textarea,
    decorators: [
        Story => (
            <div className="w-[375px] py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof Textarea>;

const FILLED = '가나다라마 abcd 1234 ^^!@ '.repeat(18);

const Demo = ({ initial }: { initial: string }) => {
    const [value, setValue] = useState(initial);
    return (
        <Textarea label="소중한 의견을 남겨주세요" value={value} onChange={setValue} placeholder="답변을 적어주세요." />
    );
};

/** Empty — the resting state; focusing darkens the border to `--focus-border`. */
export const Empty: Story = { render: () => <Demo initial="" /> };

/** Short value, well within the box. */
export const Filled: Story = { render: () => <Demo initial="가나다라마 abcd 1234 ^^!@" /> };

/** Overflowing value — the box keeps its height and scrolls instead of growing. */
export const Scrolling: Story = { render: () => <Demo initial={FILLED} /> };

export const ErrorState: Story = {
    render: () => (
        <Textarea
            label="소중한 의견을 남겨주세요"
            required
            value=""
            onChange={() => undefined}
            error="내용을 입력해 주세요."
        />
    ),
};

export const WithDescription: Story = {
    render: () => (
        <Textarea
            label="소중한 의견을 남겨주세요"
            value=""
            onChange={() => undefined}
            placeholder="답변을 적어주세요."
            description="자세히 적어주실수록 빠르게 확인할 수 있어요."
        />
    ),
};
