import { createRoot } from 'react-dom/client';

import { guardAppInjection } from '@chatic/fake-shell';
import { resolveDeepLink, resolvePushTapPath } from 'virtual-shell/mobile-deeplink';
import { getSafeAreaScript, getSyncInjectionScript } from 'virtual-shell/mobile-injection';

import { createShellApi, type ShellApi } from './shell/api';
import { SHELL_CONFIG } from './shell/config';
import { GoogleSignIn } from './shell/googleSignIn';
import { VirtualShell } from './shell/VirtualShell';
import { App } from './ui/App';
import './ui/styles.css';

declare global {
    interface Window {
        /** Called by `inject.js` inside the frame. */
        __virtualShellAttach?: (frame: Window, launch: string | null) => void;
        /** The tools, for an agent. See README § Tools. */
        virtualShell?: ShellApi;
    }
}

// The shell is created first and the sign-in sheet reads its platform lazily, when a sign-in starts.
let shell: VirtualShell | null = null;
const signIn = new GoogleSignIn(SHELL_CONFIG.googleClientId, () => shell?.status().platform ?? 'ios');
shell = new VirtualShell(
    SHELL_CONFIG,
    {
        getSyncInjectionScript: guardAppInjection({ getSyncInjectionScript }),
        getSafeAreaScript,
        resolvePushTapPath,
        resolveDeepLink,
    },
    signIn
);
const ready = shell;
window.__virtualShellAttach = (frame, launch) => void ready.attach(frame, launch);
window.virtualShell = createShellApi(ready);

createRoot(document.getElementById('root') as HTMLElement).render(<App shell={ready} signIn={signIn} />);
