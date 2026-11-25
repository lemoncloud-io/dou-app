import { useCallback } from 'react';

import { runtime } from '@chatic/runtime-react';

import { CopyButton } from '../../components/CopyButton';
import { useSlotStatuses } from '../../hooks/useSlotStatuses';
import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useStateScreenStrings } from '../../i18n/screens/StateScreen';

export const StateScreen = () => {
    const t = useStateScreenStrings();
    const session = runtime.session.useGlobalSession();
    const { isAuthenticated, isInitialized } = runtime.session.useSessionAuth();
    const socketState = runtime.connection.useRuntimeSocketState();
    const facts = runtime.session.useRuntimeProfile();
    const { deviceId, firebaseInstallationId } = runtime.session.useDynamicDeviceId();
    const { relay, cloud, identity, activeServer } = session;
    const slots = useSlotStatuses();

    const snapshot = useCallback(
        () =>
            JSON.stringify(
                {
                    isInitialized,
                    isAuthenticated,
                    deviceId,
                    firebaseInstallationId,
                    facts,
                    session,
                    socketState,
                    slots,
                },
                null,
                2
            ),
        [isInitialized, isAuthenticated, deviceId, firebaseInstallationId, facts, session, socketState, slots]
    );

    return (
        <div className="space-y-3 p-4">
            <div className="flex justify-end">
                <CopyButton value={snapshot} label={t.copyState} />
            </div>

            <Section title={t.sections.device}>
                <Row label="deviceId" value={deviceId} />
                <Row label="firebase iid" value={firebaseInstallationId} />
            </Section>

            <Section title={t.sections.session}>
                <Row label="initialized" value={String(isInitialized)} />
                <Row label="authenticated" value={String(isAuthenticated)} />
                <Row label="isGuest" value={String(facts.isGuest)} />
                <Row label="userId" value={identity.userId} />
                <Row label="delegatorId" value={identity.delegatorId} />
                <Row label="userName" value={facts.userName} />
                <Row label="userRole" value={facts.userRole} />
                <Row label="error" value={identity.error} />
            </Section>

            <Section title={t.sections.activeServer}>
                <Row label="kind" value={activeServer.kind} />
                <Row label="siteId" value={activeServer.siteId} />
                <Row label="backend" value={activeServer.backend} />
                <Row label="wss" value={activeServer.wss} />
                {'cloudId' in activeServer && <Row label="cloudId" value={activeServer.cloudId} />}
            </Section>

            <Section title={t.sections.relay}>
                <Row label="isAuthenticated" value={String(relay.isAuthenticated)} />
                <Row label="siteId" value={relay.siteId} />
                <Row label="backend" value={relay.backend} />
                <Row label="wss" value={relay.wss} />
            </Section>

            <Section title={t.sections.cloud}>
                <Row label="isActive" value={String(cloud.isActive)} />
                <Row label="cloudId" value={cloud.cloudId} />
                <Row label="siteId" value={cloud.siteId} />
                <Row label="backend" value={cloud.backend} />
                <Row label="wss" value={cloud.wss} />
            </Section>

            <Section title={t.sections.socket}>
                <Row label="state" value={socketState.state} />
                <Row label="isConnected" value={String(socketState.isConnected)} />
                <Row label="isVerified" value={String(socketState.isVerified)} />
                <Row label="connectionId" value={socketState.connectionId} />
            </Section>

            <Section title={`Socket slots (${slots.length})`}>
                {slots.map(slot => (
                    <Row
                        key={slot.key}
                        label={`${slot.active ? '▶ ' : ''}${slot.kind}`}
                        value={`${slot.key} · ${slot.state} · ${slot.verified ? 'verified' : 'unverified'} · connects ${slot.connectCount}`}
                    />
                ))}
            </Section>
        </div>
    );
};
