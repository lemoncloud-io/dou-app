import { isBelowAppVersionFloor } from './appVersionFloor';

describe('isBelowAppVersionFloor', () => {
    it.each([
        ['ios', '0.29.2', true],
        ['android', '0.28.1', true],
        ['ios', '0.30.0', false],
        ['android', '0.30.1', false],
        ['ios', '0.31.2', false],
        ['ios', '1.0', false],
    ])('a %s app at %s is below the floor: %s', (platform, version, below) => {
        expect(isBelowAppVersionFloor({ platform, version }, '0.30.0')).toBe(below);
    });

    it('compares numerically, not as text', () => {
        expect(isBelowAppVersionFloor({ platform: 'ios', version: '0.9.0' }, '0.10.0')).toBe(true);
        expect(isBelowAppVersionFloor({ platform: 'ios', version: '0.10.0' }, '0.9.0')).toBe(false);
    });

    it('never holds the desktop shell or a browser to the floor', () => {
        expect(isBelowAppVersionFloor({ platform: 'desktop', version: '0.0.1' }, '0.30.0')).toBe(false);
        expect(isBelowAppVersionFloor({ platform: undefined, version: undefined }, '0.30.0')).toBe(false);
    });

    it('lets a phone app through when its version is missing or unreadable', () => {
        expect(isBelowAppVersionFloor({ platform: 'ios', version: undefined }, '0.30.0')).toBe(false);
        expect(isBelowAppVersionFloor({ platform: 'android', version: '' }, '0.30.0')).toBe(false);
        expect(isBelowAppVersionFloor({ platform: 'android', version: '0.29.0-beta' }, '0.30.0')).toBe(false);
    });
});
