import * as ReactDOM from 'react-dom/client';

import { initAppRuntime } from '@chatic/app-runtime';

import App from './app/app';

// Boot the runtime before render — see initAppRuntime's ordering contract. The testbed exercises the
// real session and socket paths, so it boots exactly like a shipping app.
initAppRuntime();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
