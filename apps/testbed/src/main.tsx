import * as ReactDOM from 'react-dom/client';

import { config } from '@chatic/config';
import { runtime } from '@chatic/app-runtime';

import { webConfigPorts } from './app/config/adapters';

import App from './app/app';

// Wires `@chatic/config` to this build's `import.meta.env`/injected globals — replaces
// `@chatic/web-config`'s import-time self-init with an explicit call (ADR-0079 결정 1·11).
config.init(webConfigPorts);

// Boot the runtime before render — see runtime.boot.initAppRuntime's ordering contract. The testbed exercises the
// real session and socket paths, so it boots exactly like a shipping app.
runtime.boot.initAppRuntime();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
