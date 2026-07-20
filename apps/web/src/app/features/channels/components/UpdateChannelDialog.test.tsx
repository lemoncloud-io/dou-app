import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { UpdateChannelDialog } from './UpdateChannelDialog';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({ resizeImageToBase64: jest.fn() }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
// Stable channel reference — the real useChannel returns a memoized cache view, so
// UpdateChannelDialog's `useEffect([channel])` must not re-run on every render.
const mockChannel = { name: '방', thumbnail: '' };
jest.mock('../hooks', () => ({
    useChannel: () => ({ channel: mockChannel }),
    useChannelMutations: () => ({ updateChannel: jest.fn(), isPending: { update: false } }),
}));

describe('UpdateChannelDialog', () => {
    it('편집 모드: 편집 제목·안내 문구·완료 버튼을 노출하고 이름 입력은 편집 가능하다', () => {
        render(<UpdateChannelDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByText('updateChannel.title')).toBeInTheDocument();
        expect(screen.getByText('updateChannel.subtitle1')).toBeInTheDocument();
        expect(screen.getByText('updateChannel.done')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('updateChannel.namePlaceholder')).not.toHaveAttribute('readonly');
    });

    it('읽기전용 모드: 정보 제목만 노출하고 수정 안내·완료 버튼은 숨기며 입력은 readonly다', () => {
        render(<UpdateChannelDialog open onOpenChange={() => undefined} channelId="c1" readOnly />);

        expect(screen.getByText('updateChannel.readOnlyTitle')).toBeInTheDocument();
        expect(screen.queryByText('updateChannel.subtitle1')).not.toBeInTheDocument();
        expect(screen.queryByText('updateChannel.done')).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('updateChannel.namePlaceholder')).toHaveAttribute('readonly');
    });
});
