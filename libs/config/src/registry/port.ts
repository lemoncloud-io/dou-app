import type { ConfigEntry, ConfigRegistryModule } from '../types';

const choice = (port: string, envName: string, title: string, description: string): ConfigEntry<string> => ({
    title,
    description: `${description} Empty uses the app's declared default.`,
    type: 'string',
    pattern: new RegExp(`^(?:${port}\\.[a-z0-9]+(?:-[a-z0-9]+)*)?$`),
    defaultValue: '',
    envDefaultKey: `VITE_PORT_${envName}`,
    surface: 'dev',
    writableBy: ['shell', 'local', 'server'],
    persist: 'local',
    appliesAt: 'restart',
});

const fromCachePort = (former: unknown): unknown =>
    typeof former === 'string' ? former.replace(/^cache\./, 'db.') : former;

export const portModule: ConfigRegistryModule = {
    'port.storage': choice('storage', 'STORAGE', 'Storage adapter', 'Where the app keeps its data on this device.'),
    'port.transport': choice('transport', 'TRANSPORT', 'Transport adapter', 'How the app reaches the server.'),
    'port.auth': choice('auth', 'AUTH', 'Auth adapter', 'Who holds and refreshes the session credentials.'),
    'port.foreground': choice(
        'foreground',
        'FOREGROUND',
        'Foreground adapter',
        'How the app learns it moved to the foreground or the background.'
    ),
    'port.db': {
        ...choice('db', 'DB', 'Db adapter', 'Where the outbox and the cached rows are kept.'),
        formerKey: { key: 'port.cache', value: fromCachePort },
    },
    'port.checkout': choice('checkout', 'CHECKOUT', 'Checkout adapter', 'Who sells a subscription.'),
    'port.media': choice('media', 'MEDIA', 'Media adapter', 'Who picks and prepares photos and videos.'),
    'port.files': choice('files', 'FILES', 'Files adapter', "Who uploads and downloads a message's files."),
    'port.links': choice(
        'links',
        'LINKS',
        'Links adapter',
        'Who opens URLs, uses the clipboard and takes in shared content.'
    ),
    'port.appShell': choice(
        'appShell',
        'APP_SHELL',
        'App shell adapter',
        'Who handles the icon, badge, haptics, back gesture, keyboard and update.'
    ),
    'port.signIn': choice(
        'signIn',
        'SIGN_IN',
        'Sign-in adapter',
        'Who runs social sign-in, account linking and device pairing.'
    ),
    'port.diagnostics': choice(
        'diagnostics',
        'DIAGNOSTICS',
        'Diagnostics adapter',
        'Who queues logs and issue reports.'
    ),
    'port.push': choice('push', 'PUSH', 'Push adapter', 'Who registers the device for push and receives taps.'),
    'port.logSink': choice('logSink', 'LOG_SINK', 'Log sink adapter', 'Where log entries are written.'),
    'port.engine': choice(
        'engine',
        'ENGINE',
        'Engine adapter',
        'Which engine runs the session: this page, or a mirror of the one the shell owns.'
    ),
};
