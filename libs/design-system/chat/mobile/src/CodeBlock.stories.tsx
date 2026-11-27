import type { Meta, StoryObj } from '@storybook/react';

import { CodeBlock, InlineCode, type CodeBlockProps } from './index';
import { MessageBubble } from '@chatic/design-system-components-mobile';

const SAMPLE = `const res = await fetch('/api/channels');\nconst { list } = await res.json();`;

const meta: Meta<typeof CodeBlock> = {
    title: 'web-ui-kit/composites/CodeBlock',
    component: CodeBlock,
    args: { code: SAMPLE, lang: 'ts' },
    decorators: [
        Story => (
            <div className="w-[300px] py-2">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof CodeBlock>;

export const Default: Story = {};

export const WithoutLang: Story = { args: { lang: undefined } };

export const WithCopyButton: Story = { args: { onCopy: () => undefined, copyLabel: '복사' } };

export const Copied: Story = {
    args: { onCopy: () => undefined, copyLabel: '복사', copiedLabel: '복사됨', copied: true },
};

export const LongLine: Story = {
    args: { code: `const veryLongIdentifier = ${'"'}${'x'.repeat(200)}${'"'};`, lang: 'js' },
};

export const InBubbles: Story = {
    render: (args: CodeBlockProps) => (
        <div className="flex flex-col items-start gap-3">
            <MessageBubble variant="other">
                <>
                    이렇게 쓰면 돼: <InlineCode>npm i</InlineCode>
                    <CodeBlock {...args} onCopy={() => undefined} copyLabel="복사" />
                </>
            </MessageBubble>
            <MessageBubble variant="mine">
                <>
                    이렇게 쓰면 돼: <InlineCode>npm i</InlineCode>
                    <CodeBlock {...args} onCopy={() => undefined} copyLabel="복사" />
                </>
            </MessageBubble>
        </div>
    ),
};
