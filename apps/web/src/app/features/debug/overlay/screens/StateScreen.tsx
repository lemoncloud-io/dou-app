import { runtime } from '@chatic/app-runtime';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';

/** Read-only snapshot of session/server/socket state (singleton stores, router-independent). */
export const StateScreen = () => {
    const session = runtime.session.useGlobalSession();
    const { isAuthenticated, isInitialized } = runtime.session.useSessionAuth();
    const socketState = runtime.connection.useRuntimeSocketState();
    const facts = runtime.session.useRuntimeProfile();
    // Socket identity and push registration must share these exact ids (useDynamicDeviceId's
    // docblock), and a mismatch shows up as "push goes to the wrong install" — so read them here.
    const { deviceId, firebaseInstallationId } = runtime.session.useDynamicDeviceId();
    const { relay, cloud, identity, activeServer } = session;

    return (
        <div className="space-y-3 p-4">
            <Section title="Device">
                <Row label="deviceId" value={deviceId} />
                <Row label="firebase iid" value={firebaseInstallationId} />
            </Section>

            <Section title="Session">
                <Row label="initialized" value={String(isInitialized)} />
                <Row label="authenticated" value={String(isAuthenticated)} />
                <Row label="isGuest" value={String(facts.isGuest)} />
                <Row label="userId" value={identity.userId} />
                <Row label="delegatorId" value={identity.delegatorId} />
                <Row label="userName" value={facts.userName} />
                <Row label="userRole" value={facts.userRole} />
                <Row label="error" value={identity.error?.message ?? null} />
            </Section>

            <Section title="Active Server">
                <Row label="kind" value={activeServer.kind} />
                <Row label="siteId" value={activeServer.siteId} />
                <Row label="backend" value={activeServer.backend} />
                <Row label="wss" value={activeServer.wss} />
                <Row label="identityToken" value={activeServer.identityToken} />
                {'cloudId' in activeServer && <Row label="cloudId" value={activeServer.cloudId} />}
            </Section>

            <Section title="Relay">
                <Row label="isAuthenticated" value={String(relay.isAuthenticated)} />
                <Row label="siteId" value={relay.siteId} />
                <Row label="backend" value={relay.backend} />
                <Row label="wss" value={relay.wss} />
                <Row label="identityToken" value={relay.identityToken} />
            </Section>

            <Section title="Cloud">
                <Row label="isActive" value={String(cloud.isActive)} />
                <Row label="cloudId" value={cloud.cloudId} />
                <Row label="siteId" value={cloud.siteId} />
                <Row label="backend" value={cloud.backend} />
                <Row label="wss" value={cloud.wss} />
                <Row label="identityToken" value={cloud.identityToken} />
            </Section>

            <Section title="Socket">
                <Row label="state" value={socketState.state} />
                <Row label="isConnected" value={String(socketState.isConnected)} />
                <Row label="isVerified" value={String(socketState.isVerified)} />
                <Row label="connectionId" value={socketState.connectionId} />
            </Section>
        </div>
    );
};
