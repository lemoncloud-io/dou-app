import { SubscriptionPortError, type SubscriptionPort } from '../../lib/port';

/**
 * How the fake server answers a signed-in reader's read of its dollar catalog, for the stages that sell
 * no dollars: `empty` (no dollar product yet), `failure` (the read fails), or `held` (unanswered until
 * `release`, then the fake's own list). A visitor still gets the published catalog, as from the HTTP port:
 * the server lists its products to a signed request only. Every other read is the fake's own — the
 * dollar preview and start included, which the real server would refuse with no dollar product, so a test
 * using this stops where the page stops.
 */
export const answerDollarCatalog = (
    port: SubscriptionPort,
    answer: 'empty' | 'failure' | 'held'
): { release: () => void } => {
    const listPlans = port.listPlans.bind(port);
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => {
        release = resolve;
    });
    port.listPlans = async input => {
        if (input?.currency !== 'USD' || !(await port.getSession())) return listPlans(input);
        if (answer === 'empty') return [];
        if (answer === 'failure') throw new SubscriptionPortError('network', 'dollar catalog unreachable');
        await held;
        return listPlans(input);
    };
    return { release };
};
