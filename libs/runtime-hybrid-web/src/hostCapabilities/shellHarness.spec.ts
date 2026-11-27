import { readShellHarness, SHELL_HARNESS_GLOBAL, shellCheckoutUrl } from './shellHarness';

const page = (value: unknown) => ({ [SHELL_HARNESS_GLOBAL]: value });

describe('readShellHarness', () => {
    it('reads what the virtual shell injected', () => {
        expect(readShellHarness(page({ version: 1, sandbox: true }), { productionBuild: false })).toEqual({
            version: 1,
            sandbox: true,
        });
        expect(
            readShellHarness(page({ version: 1, sandbox: false, subscriptionWeb: 'http://localhost:5004/x' }), {
                productionBuild: false,
            })
        ).toEqual({ version: 1, sandbox: false, subscriptionWeb: 'http://localhost:5004' });
    });

    it('ignores the values in a production build, even when they are there', () => {
        expect(readShellHarness(page({ version: 1, sandbox: true }), { productionBuild: true })).toBeNull();
    });

    it('reads nothing on a host that injected nothing, as the mobile app', () => {
        expect(readShellHarness({}, { productionBuild: false })).toBeNull();
        expect(readShellHarness(undefined, { productionBuild: false })).toBeNull();
    });

    it('ignores a shape it does not know, and an origin that is not http', () => {
        expect(readShellHarness(page({ version: 2, sandbox: true }), { productionBuild: false })).toBeNull();
        expect(readShellHarness(page({ version: 1, sandbox: 'yes' }), { productionBuild: false })).toBeNull();
        expect(
            readShellHarness(page({ version: 1, sandbox: false, subscriptionWeb: 'javascript:alert(1)' }), {
                productionBuild: false,
            })
        ).toEqual({ version: 1, sandbox: false });
    });
});

describe('shellCheckoutUrl', () => {
    const plans = 'https://app-dev.chatic.io/subscription/plans';

    it('keeps the deployed address when no local subscription website answered', () => {
        expect(shellCheckoutUrl(plans, { version: 1, sandbox: false })).toBe(plans);
    });

    it('moves the page onto the local subscription website, and asks it for the sandbox', () => {
        expect(
            shellCheckoutUrl(`${plans}?from=app`, {
                version: 1,
                sandbox: true,
                subscriptionWeb: 'http://localhost:5004',
            })
        ).toBe('http://localhost:5004/subscription/plans?from=app&sandbox=1');
    });
});
