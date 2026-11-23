import { type JSX } from 'react';

import { ThemeProvider } from '@chatic/theme';

import { Router } from './routes';

export const App = (): JSX.Element => {
    return (
        <ThemeProvider defaultTheme="light">
            <Router />
        </ThemeProvider>
    );
};

export default App;
