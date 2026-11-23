import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { ThemeProvider } from '@chatic/theme';

import { App } from './app/app';
import './syntax.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <ThemeProvider defaultTheme="system">
            <App />
        </ThemeProvider>
    </StrictMode>
);
