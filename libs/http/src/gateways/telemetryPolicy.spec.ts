import { createStaticTelemetryPolicyHttpGateway, DISABLED_TELEMETRY_POLICY_WIRE } from './telemetryPolicy';

describe('createStaticTelemetryPolicyHttpGateway', () => {
    it('answers statistics off by default', async () => {
        await expect(createStaticTelemetryPolicyHttpGateway().getTelemetryPolicy()).resolves.toEqual({
            version: 0,
            enabled: false,
        });
    });

    it('answers the document it was given', async () => {
        const policy = { version: 3, enabled: true, defaults: { perf: 1, usage: 1 } };
        await expect(createStaticTelemetryPolicyHttpGateway(policy).getTelemetryPolicy()).resolves.toBe(policy);
    });

    it('cannot have its default changed by a caller', () => {
        expect(Object.isFrozen(DISABLED_TELEMETRY_POLICY_WIRE)).toBe(true);
    });
});
