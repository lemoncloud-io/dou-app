import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SmsScreen } from './SmsScreen';
import { setDebugLanguageForTests } from '../../i18n';

const sendSms = jest.fn();
const getContacts = jest.fn();

jest.mock('../../../../bridge', () => ({
    appBridge: { sendSms: (n: string[], m: string) => sendSms(n, m), getContacts: () => getContacts() },
}));
jest.mock('@chatic/bridges', () => ({ logger: { warn: jest.fn(), info: jest.fn() } }));

describe('SmsScreen', () => {
    let restoreLanguage: () => void;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreLanguage = setDebugLanguageForTests('en');
    });
    afterEach(() => restoreLanguage());

    it('번호가 없으면 작성 창을 열 수 없다', () => {
        render(<SmsScreen />);

        expect(screen.getByRole('button', { name: 'Open compose sheet' })).toBeDisabled();
    });

    it('쉼표로 나눈 번호를 배열로 보낸다', async () => {
        sendSms.mockResolvedValue({ data: { success: true } });
        render(<SmsScreen />);
        await userEvent.type(screen.getByPlaceholderText(/01012345678/), '01011112222, 01033334444');

        await userEvent.click(screen.getByRole('button', { name: 'Open compose sheet' }));

        expect(sendSms).toHaveBeenCalledWith(['01011112222', '01033334444'], expect.any(String));
    });

    it('빈 항목은 걸러낸다', async () => {
        sendSms.mockResolvedValue({ data: { success: true } });
        render(<SmsScreen />);
        await userEvent.type(screen.getByPlaceholderText(/01012345678/), '01011112222, ,');

        await userEvent.click(screen.getByRole('button', { name: 'Open compose sheet' }));

        expect(sendSms).toHaveBeenCalledWith(['01011112222'], expect.any(String));
    });

    it('앱이 거부하면 실패를 적는다', async () => {
        sendSms.mockRejectedValue(new Error('SMS_ERROR'));
        render(<SmsScreen />);
        await userEvent.type(screen.getByPlaceholderText(/01012345678/), '01011112222');

        await userEvent.click(screen.getByRole('button', { name: 'Open compose sheet' }));

        expect(await screen.findByText(/failed: SMS_ERROR/)).toBeInTheDocument();
    });
});
