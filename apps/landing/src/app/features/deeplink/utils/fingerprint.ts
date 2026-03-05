export const generateFingerprint = async (): Promise<string> => {
    let ip = 'unknown';
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ip = data.ip || 'unknown';
    } catch (e) {
        console.error('[Fingerprint] Failed to get IP:', e);
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = (navigator.language || 'unknown').split('-')[0];

    const str = `${ip}|${timezone}|${locale}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }

    return Math.abs(hash).toString(16).padStart(8, '0');
};
