import type { Meta, StoryObj } from '@storybook/react';

import { IconChevronRight } from '../../resources/icons';
import { Switch } from '../../foundations/switch/Switch';
import { ListRow } from '../list/ListRow';
import { MenuCard } from './MenuCard';

const meta: Meta<typeof MenuCard> = {
    title: 'web-ui-kit/composites/MenuCard',
    component: MenuCard,
    decorators: [
        Story => (
            <div className="w-[390px] bg-background p-4">
                <Story />
            </div>
        ),
    ],
};
export default meta;

type Story = StoryObj<typeof MenuCard>;

export const SettingsGroup: Story = {
    render: () => (
        <MenuCard>
            <ListRow title="다크 모드" trailing={<Switch checked />} />
            <ListRow
                title="언어 설정"
                subtitle={undefined}
                trailing={
                    <>
                        <span className="text-description">한국어</span>
                        <IconChevronRight className="size-[18px] text-description" />
                    </>
                }
                onClick={() => undefined}
            />
            <ListRow
                title="온보딩 다시보기"
                trailing={<IconChevronRight className="size-[18px] text-description" />}
                onClick={() => undefined}
            />
        </MenuCard>
    ),
};

export const SingleRow: Story = {
    render: () => (
        <MenuCard>
            <ListRow title="로그아웃" destructive onClick={() => undefined} />
        </MenuCard>
    ),
};
