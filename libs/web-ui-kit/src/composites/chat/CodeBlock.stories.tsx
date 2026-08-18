import type { Meta, StoryObj } from '@storybook/react';

import { CodeBlock, InlineCode, MessageBubble, type CodeBlockProps } from '@chatic/web-ui-kit';

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

/**
 * The readability check that matters: with no syntax colouring, a long line has to scroll inside
 * the block — never wrap, and never widen the bubble past the row's cap.
 */
export const LongLine: Story = {
    args: { code: `const veryLongIdentifier = ${'"'}${'x'.repeat(200)}${'"'};`, lang: 'js' },
};

/**
 * Both bubble variants, because the block's tint has to read against a light AND a dark ground —
 * this is where a contrast mistake actually shows up.
 */
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
