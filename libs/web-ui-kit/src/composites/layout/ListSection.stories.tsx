import type { Meta, StoryObj } from '@storybook/react';

import { ListRow } from '@chatic/web-ui-kit';
import { VerifiedBadge } from '@chatic/web-ui-kit';
import { IconChevronDown, IconPlus } from '@chatic/web-ui-kit';
import { PlaceAvatar } from '@chatic/web-ui-kit';
import { ListSection } from '@chatic/web-ui-kit';

const meta: Meta<typeof ListSection> = {
    title: 'web-ui-kit/composites/ListSection',
    component: ListSection,
    decorators: [
        Story => (
            <div className="w-[375px]">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof ListSection>;

/**
 * Home "Place" section (Figma 2675:14545) composed from a ListSection header +
 * ListRow items — the default place uses PlaceAvatar + VerifiedBadge.
 */
export const PlaceSection: Story = {
    render: () => (
        <ListSection title="Place" actions={<IconChevronDown className="size-[18px] text-foreground" />}>
            <ListRow
                leading={<PlaceAvatar />}
                title={
                    <>
                        <span>DoU Home</span>
                        <VerifiedBadge label="기본 플레이스" />
                    </>
                }
                subtitle="기본 플레이스"
                onClick={() => undefined}
            />
            <ListRow
                leading={
                    <span className="flex size-[42px] items-center justify-center rounded-full border border-input-border">
                        <IconPlus className="size-6 text-foreground" />
                    </span>
                }
                title="플레이스 추가"
                onClick={() => undefined}
            />
        </ListSection>
    ),
};
