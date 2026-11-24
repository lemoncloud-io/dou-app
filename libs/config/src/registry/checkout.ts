import type { ConfigRegistryModule } from '../types';

export const checkoutModule: ConfigRegistryModule = {
    'checkout.sandbox': {
        title: 'Checkout sandbox',
        description:
            "Sends the web checkout's payer calls with ?sandbox=1: the payment server's mock provider, no real card, no charge. A dev or local build only; inside the virtual shell the shell's choice wins.",
        type: 'boolean',
        defaultValue: false,
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'local',
        appliesAt: 'restart',
    },
};
