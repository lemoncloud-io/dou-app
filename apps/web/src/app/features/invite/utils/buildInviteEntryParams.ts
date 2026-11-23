const AWS_REGION = 'ap-northeast-2';

export const buildInviteEntryParams = (search: string): URLSearchParams => {
    const source = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

    const code = source.get('code');
    const api = source.get('api');
    const stage = source.get('stage');
    const backendParam = source.get('backend');
    const hasAddress = !!backendParam || !!api || !!stage;
    const isRelay = source.has('relay') || !hasAddress;

    if (!code) throw new Error('Input link is missing the code parameter.');
    if (!isRelay && !backendParam) {
        if (!api) throw new Error('Input link is missing the api or backend parameter.');
        if (!stage) throw new Error('Input link is missing the stage parameter.');
    }

    const params = new URLSearchParams();
    params.set('code', code);
    params.set('provider', 'invite');
    params.set('version', '2');
    if (isRelay) {
        params.set('relay', '1');
    } else {
        params.set('_backend', backendParam || `https://${api}.execute-api.${AWS_REGION}.amazonaws.com/${stage}`);
    }

    const consumed = new Set(['code', 'api', 'stage', 'backend', 'relay']);
    source.forEach((value, key) => {
        if (!consumed.has(key)) params.append(key, value);
    });

    return params;
};
