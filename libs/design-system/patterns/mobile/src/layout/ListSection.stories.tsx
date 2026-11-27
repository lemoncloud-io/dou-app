import type { Meta, StoryObj } from '@storybook/react';

import { ListRow } from '../list';
import { VerifiedBadge, PlaceAvatar } from '@chatic/design-system-components-mobile';
import { IconChevronDown, IconPlus } from '@chatic/design-system-assets/icons';
import { ListSection } from './index';

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
