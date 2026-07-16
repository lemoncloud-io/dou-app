import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { RoomNotificationDialog } from './RoomNotificationDialog';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/web-ui-kit', () => ({
    Switch: ({ checked, onCheckedChange, label }: any) => (
        <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onCheckedChange(!checked)} />
    ),
}));

describe('RoomNotificationDialog', () => {
    it('메시지 알림 토글은 로컬 상태로 on/off 된다 (UI only)', () => {
        render(<RoomNotificationDialog open onOpenChange={() => undefined} />);

        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
});
