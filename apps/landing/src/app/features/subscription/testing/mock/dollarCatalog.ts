import { SubscriptionPortError, type SubscriptionPort } from '../../lib/port';

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
