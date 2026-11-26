(() => {
    const target = new URL(location.href).searchParams.get('to');
    const status = document.getElementById('status');
    const detail = document.getElementById('detail');
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
            detail.hidden = false;
            retry.hidden = false;
            timer = setTimeout(go, delays[Math.min(attempt++, delays.length - 1)]);
        }
    };

    retry.addEventListener('click', go);
    if (!target || !/^https:\/\//.test(target)) {
        status.textContent = 'No address to open';
    } else {
        go();
    }
})();
