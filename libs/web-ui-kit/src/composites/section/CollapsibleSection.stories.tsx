import type { Meta, StoryObj } from '@storybook/react';

import { CollapsibleSection, ListRow } from '@chatic/web-ui-kit';

const meta: Meta<typeof CollapsibleSection> = {
    title: 'web-ui-kit/composites/CollapsibleSection',
    component: CollapsibleSection,
    args: {
        title: 'Place',
        children: (
            <>
                <ListRow title="DoU Home" subtitle="기본 플레이스" />
                <ListRow title="Sunny Place" subtitle="내 플레이스" />
            </>
        ),
    },
    decorators: [
        Story => (
            <div className="w-[375px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof CollapsibleSection>;

export const Open: Story = {};
export const Collapsed: Story = { args: { defaultOpen: false } };
export const WithCount: Story = { args: { title: 'Chat', count: 4 } };

/**
 * The home layout in miniature: two sections inside a fixed-height flex-column scroll container,
 * with more rows than fit. Use this to check that a long list overflows the scroller
 * (scrollHeight > clientHeight) and that the trailing spacer is included, rather than the sections
 * being clipped — the failure mode this shape is prone to across engines.
 */
export const InsideScrollContainer: Story = {
    decorators: [],
    render: () => (
        <div className="flex h-[400px] w-[375px] flex-col overflow-hidden border">
            <div data-testid="scroller" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <CollapsibleSection title="Place" count={2}>
                    {Array.from({ length: 2 }).map((_, i) => (
                        <ListRow key={i} title={`place ${i + 1}`} subtitle="플레이스" />
                    ))}
                </CollapsibleSection>
                <CollapsibleSection title="Chat" count={20}>
                    {Array.from({ length: 20 }).map((_, i) => (
                        <ListRow key={i} title={`chat ${i + 1}`} subtitle="마지막 메시지" />
                    ))}
                </CollapsibleSection>
                <div aria-hidden className="h-[224px] shrink-0" />
            </div>
        </div>
    ),
};
