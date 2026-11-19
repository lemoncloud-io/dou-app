import { recordTelemetry } from '@chatic/bridges';

import { recordAppIconChange, reportAppIconInUse, startAppIconUsage, toAppIconAttr } from './appIcon';

jest.mock('@chatic/bridges', () => ({ recordTelemetry: jest.fn() }));

const recordMock = recordTelemetry as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('toAppIconAttr', () => {
    it('folds every name of the primary icon into DefaultIcon', () => {
        expect(toAppIconAttr(null)).toBe('DefaultIcon');
        expect(toAppIconAttr(undefined)).toBe('DefaultIcon');
        expect(toAppIconAttr('default')).toBe('DefaultIcon');
        expect(toAppIconAttr('DefaultIcon')).toBe('DefaultIcon');
    });

    it('keeps a shipped icon id as it is', () => {
        expect(toAppIconAttr('MidnightIcon')).toBe('MidnightIcon');
        expect(toAppIconAttr('SkyIcon')).toBe('SkyIcon');
    });

    it('counts an icon this build does not know as other', () => {
        expect(toAppIconAttr('NeonIcon')).toBe('other');
    });
});

describe('recordAppIconChange', () => {
    it('records the icon left and the icon picked', () => {
        recordAppIconChange('default', 'AuroraIcon');

        expect(recordMock).toHaveBeenCalledWith('event', 'app_icon_change', {
            attrs: { from: 'DefaultIcon', to: 'AuroraIcon' },
        });
    });

    it('records nothing when the pick is the icon already in use under another name', () => {
        recordAppIconChange('DefaultIcon', null);

        expect(recordMock).not.toHaveBeenCalled();
    });
});

describe('reportAppIconInUse', () => {
    it('records the icon the app reports', async () => {
        await reportAppIconInUse(() => Promise.resolve({ iconName: 'WhiteIcon', supported: true }));

        expect(recordMock).toHaveBeenCalledWith('event', 'app_icon_in_use', { attrs: { icon: 'WhiteIcon' } });
    });

    it('records nothing for an app that cannot switch icons', async () => {
        await reportAppIconInUse(() => Promise.resolve({ iconName: 'DefaultIcon', supported: false }));

        expect(recordMock).not.toHaveBeenCalled();
    });

    it('records nothing when the app gives no answer', async () => {
        await reportAppIconInUse(() => Promise.resolve(undefined));

        expect(recordMock).not.toHaveBeenCalled();
    });

    it('swallows a failed lookup instead of rejecting', async () => {
        await expect(reportAppIconInUse(() => Promise.reject(new Error('bridge down')))).resolves.toBeUndefined();
        expect(recordMock).not.toHaveBeenCalled();
    });
});

describe('startAppIconUsage', () => {
    it('reports for the running session and again for each later one until stopped', async () => {
        const fetchIcon = jest.fn(() => Promise.resolve({ iconName: 'SkyIcon', supported: true }));
        let sessionStarted: (() => void) | undefined;
        const unsubscribe = jest.fn();
        const onSessionStart = jest.fn((listener: () => void) => {
            sessionStarted = listener;
            return unsubscribe;
        });

        const stop = startAppIconUsage({ fetchIcon, onSessionStart });
        await Promise.resolve();
        expect(recordMock).toHaveBeenCalledTimes(1);

        sessionStarted?.();
        await Promise.resolve();
        expect(fetchIcon).toHaveBeenCalledTimes(2);
        expect(recordMock).toHaveBeenCalledTimes(2);

        stop();
        expect(unsubscribe).toHaveBeenCalled();
    });
});
