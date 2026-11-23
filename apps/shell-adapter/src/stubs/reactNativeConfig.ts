interface ShellWindow {
    virtualShell?: { status(): { env: 'dev' | 'prod' } };
}

const Config = {
    get VITE_ENV(): 'DEV' | 'PROD' {
        return (globalThis as ShellWindow).virtualShell?.status().env === 'prod' ? 'PROD' : 'DEV';
    },
};

export default Config;
