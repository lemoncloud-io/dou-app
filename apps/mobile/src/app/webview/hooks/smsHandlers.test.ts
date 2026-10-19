import type { ILogService } from '../../services/log';
import type { ISmsService } from '../../services/sms';
import { createSmsHandlers } from './smsHandlers';

const createLoggerMock = (): ILogService =>
    ({
        subscribe: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }) as any;

const sendSmsMessage = { type: 'SendSms', data: { phoneNumbers: '+821012345678', message: 'invite' } } as any;

describe('createSmsHandlers', () => {
    it('answers an opened composer with data.success true', async () => {
        const smsService: jest.Mocked<ISmsService> = { sendSms: jest.fn().mockResolvedValue(true) };
        const handlers = createSmsHandlers(smsService, createLoggerMock());

        const res = await handlers.handleSendSms(sendSmsMessage);

        expect(smsService.sendSms).toHaveBeenCalledWith('+821012345678', 'invite');
        expect(res).toEqual({ type: 'OnSendSms', success: true, data: { success: true } });
    });

    it('answers a composer that could not open as a successful reply carrying data.success false', async () => {
        const smsService: jest.Mocked<ISmsService> = { sendSms: jest.fn().mockResolvedValue(false) };
        const handlers = createSmsHandlers(smsService, createLoggerMock());

        const res = await handlers.handleSendSms(sendSmsMessage);

        expect(res).toEqual({ type: 'OnSendSms', success: true, data: { success: false } });
    });

    it('answers a thrown error as a failed reply with SMS_ERROR', async () => {
        const smsService: jest.Mocked<ISmsService> = { sendSms: jest.fn().mockRejectedValue(new Error('no activity')) };
        const logger = createLoggerMock();
        const handlers = createSmsHandlers(smsService, logger);

        const res = await handlers.handleSendSms(sendSmsMessage);

        expect(res).toEqual({
            type: 'OnSendSms',
            success: false,
            error: { code: 'SMS_ERROR', message: 'no activity' },
        });
        expect(logger.error).toHaveBeenCalled();
    });
});
