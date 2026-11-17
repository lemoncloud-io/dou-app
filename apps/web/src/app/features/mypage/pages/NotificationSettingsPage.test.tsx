import { fireEvent, render, screen } from '@testing-library/react';

import { NotificationSettingsPage } from './NotificationSettingsPage';

const mockHaptic = jest.fn();
const setPushEnabled = jest.fn();
const setBlurLastMessage = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/web-ui-kit', () => ({
    MenuCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ListRow: ({ title, trailing }: { title: string; trailing?: React.ReactNode }) => (
        <label>
            {title}
            {trailing}
        </label>
    ),
    Switch: ({
        checked,
        onCheckedChange,
        disabled,
    }: {
        checked: boolean;
        onCheckedChange: (on: boolean) => void;
        disabled?: boolean;
    }) => (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
        />
    ),
}));
jest.mock('../hooks', () => ({
    useDevicePushMute: () => ({ pushEnabled: true, setPushEnabled, isSupported: true }),
}));
jest.mock('../../../hooks', () => ({ useBlurLastMessage: () => ({ blurLastMessage: false, setBlurLastMessage }) }));
jest.mock('../../../ui/components', () => ({ PageHeader: () => null }));
jest.mock('../../../bridge/haptics', () => ({ haptics: { play: (kind: string) => mockHaptic(kind) } }));

beforeEach(() => jest.clearAllMocks());

const pushSwitch = () => screen.getAllByRole('switch')[0];
const previewSwitch = () => screen.getAllByRole('switch')[1];

describe('NotificationSettingsPage — switches', () => {
    it('ticks as push flips, and mutes it', () => {
        render(<NotificationSettingsPage />);
        fireEvent.click(pushSwitch());

        expect(setPushEnabled).toHaveBeenCalledWith(false);
        expect(mockHaptic.mock.calls).toEqual([['selection']]);
    });

    it('ticks as the message preview flips, and blurs it', () => {
        render(<NotificationSettingsPage />);
        fireEvent.click(previewSwitch());

        expect(setBlurLastMessage).toHaveBeenCalledWith(true);
        expect(mockHaptic.mock.calls).toEqual([['selection']]);
    });
});
