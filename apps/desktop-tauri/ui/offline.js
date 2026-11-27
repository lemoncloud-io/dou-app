(() => {
    const target = new URL(location.href).searchParams.get('to');
    const status = document.getElementById('status');
    const retry = document.getElementById('retry');
    const delays = [1000, 2000, 4000, 8000, 15000];
    let attempt = 0;
    let timer = 0;

    const go = async () => {
        clearTimeout(timer);
        status.textContent = 'Connecting…';
        try {
            const controller = new AbortController();
            const abort = setTimeout(() => controller.abort(), 8000);
            await fetch(target, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
            clearTimeout(abort);
            location.replace(target);
        } catch {
            status.textContent = 'No connection';
            timer = setTimeout(go, delays[Math.min(attempt++, delays.length - 1)]);
        }
    };

    retry.addEventListener('click', go);
    window.addEventListener('online', go);
    if (!target || !/^(https:\/\/|http:\/\/localhost[:/])/.test(target)) {
        status.textContent = 'No address to open';
        retry.hidden = true;
    } else {
        timer = setTimeout(go, 1500);
    }
})();
