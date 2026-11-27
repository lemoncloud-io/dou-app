use std::sync::mpsc;
use std::time::Duration;

use tauri::{Runtime, WebviewWindow};

const WAIT: Duration = Duration::from_secs(15);
const PNG_MAGIC: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

#[cfg(target_os = "macos")]
mod mac;
#[cfg(windows)]
mod win;

pub fn is_png(bytes: &[u8]) -> bool {
    bytes.starts_with(&PNG_MAGIC)
}

pub fn png_of<R: Runtime>(window: &WebviewWindow<R>) -> Result<Vec<u8>, String> {
    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();
    window
        .with_webview(move |webview| {
            #[cfg(target_os = "macos")]
            mac::snapshot(&webview, tx);
            #[cfg(windows)]
            win::snapshot(&webview, tx);
            #[cfg(not(any(target_os = "macos", windows)))]
            {
                let _ = (
                    &webview,
                    tx.send(Err("screenshots are not supported here".into())),
                );
            }
        })
        .map_err(|e| e.to_string())?;
    let png = rx
        .recv_timeout(WAIT)
        .map_err(|_| "the webview did not answer in time".to_string())??;
    if is_png(&png) {
        Ok(png)
    } else {
        Err("the webview returned something that is not a PNG".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_png_bytes_pass_the_magic_check() {
        assert!(is_png(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0]));
        assert!(!is_png(b"GIF89a"));
        assert!(!is_png(&[]));
    }
}
