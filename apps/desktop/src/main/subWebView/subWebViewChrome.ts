/**
 * The shell's own drawing around a sub view: a dimmed backdrop over the main window, the modal's
 * card and its bar — the title and a close control. One local page in a view of its own under the
 * page's view, so nothing the page does can draw over it or reach it. Electron-free; the window code
 * loads the HTML and calls the functions it defines.
 *
 * Every value that came from outside (a title, an error) is handed in base64 and decoded inside the
 * page, so it never becomes part of the HTML or the script. The close control navigates to
 * `SUB_WEBVIEW_CLOSE_URL`, which main catches before anything loads.
 */
import { SUB_WEBVIEW_BAR_HEIGHT, type Rect } from './desktopSubWebViewPolicy';
import { SUB_WEBVIEW_CLOSE_URL } from './subWebViewContract';

const base64 = (value: string): string => Buffer.from(value, 'utf8').toString('base64');

/** The chrome's labels, in the app's language. */
export const subWebViewChromeLabels = (language: string): { close: string; loadFailed: string } =>
    language === 'ko'
        ? { close: '닫기', loadFailed: '페이지를 열지 못했어요.' }
        : { close: 'Close', loadFailed: 'This page could not be opened.' };

export const buildSubWebViewChromeHtml = (input: {
    dark: boolean;
    language: string;
    card: Rect;
    title: string;
}): string => {
    const { dark, card } = input;
    const labels = subWebViewChromeLabels(input.language);
    const fg = dark ? '#e8eaed' : '#1f2328';
    const bg = dark ? '#16191d' : '#ffffff';
    const line = dark ? '#2a2f36' : '#e5e7eb';
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
html,body{margin:0;height:100%;overflow:hidden;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;user-select:none}
body{background:rgba(0,0,0,.45)}
#card{position:absolute;background:${bg};color:${fg};border-radius:10px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.35)}
#bar{height:${SUB_WEBVIEW_BAR_HEIGHT}px;display:flex;align-items:center;gap:8px;padding:0 8px 0 16px;border-bottom:1px solid ${line};box-sizing:border-box}
#title{flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#close{border:0;background:transparent;color:${fg};font-size:13px;padding:6px 10px;border-radius:6px;cursor:pointer}
#close:hover{background:${line}}
#error{display:none;padding:32px 16px;text-align:center;opacity:.8}
</style></head><body>
<div id="card"><div id="bar"><div id="title"></div><button id="close" type="button"></button></div><div id="error"></div></div>
<script>
var decode=function(b){return new TextDecoder().decode(Uint8Array.from(atob(b),function(c){return c.charCodeAt(0)}))};
window.__layout=function(x,y,w,h){var s=document.getElementById('card').style;s.left=x+'px';s.top=y+'px';s.width=w+'px';s.height=h+'px'};
window.__title=function(b){document.getElementById('title').textContent=decode(b)};
window.__error=function(b){var e=document.getElementById('error');e.textContent=decode(b);e.style.display='block'};
document.getElementById('close').textContent=decode("${base64(labels.close)}");
document.getElementById('close').addEventListener('click',function(){location.href=${JSON.stringify(SUB_WEBVIEW_CLOSE_URL)}});
window.__layout(${card.x},${card.y},${card.width},${card.height});
window.__title("${base64(input.title)}");
</script></body></html>`;
};

export const chromeDataUrl = (html: string): string => `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

/** The calls the window makes into the chrome page. */
export const chromeLayoutScript = (card: Rect): string =>
    `window.__layout(${Math.round(card.x)},${Math.round(card.y)},${Math.round(card.width)},${Math.round(card.height)})`;
export const chromeTitleScript = (title: string): string => `window.__title("${base64(title)}")`;
export const chromeErrorScript = (message: string): string => `window.__error("${base64(message)}")`;
