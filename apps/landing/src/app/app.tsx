import { type JSX } from 'react';

import { ThemeProvider } from '@chatic/theme';

import { Router } from './routes';

// The one place providers are assembled; main.tsx only renders this.
export const App = (): JSX.Element => {
    return (
        <ThemeProvider defaultTheme="light">
            <Router />
        </ThemeProvider>
    );
};

export default App;
