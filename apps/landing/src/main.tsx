import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';

import { ThemeProvider } from '@chatic/theme';

import './i18n';
import App from './app/app';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <ThemeProvider defaultTheme="light">
            <App />
        </ThemeProvider>
    </StrictMode>
);
