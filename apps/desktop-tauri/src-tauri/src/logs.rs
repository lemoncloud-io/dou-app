use std::fs::{File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const MAX_BYTES: u64 = 1024 * 1024;
pub const KEEP: usize = 3;
pub const MAX_LINE: usize = 4096;
pub const MAX_PER_SECOND: u32 = 200;
pub const KNOWN: [&str; 3] = ["shell", "webview", "node"];

pub struct Sink {
    path: PathBuf,
    max_bytes: u64,
    keep: usize,
    file: Mutex<Option<File>>,
}

fn guard<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|p| p.into_inner())
}

pub fn iso(ms: u64) -> String {
    let secs = ms / 1000;
    let days = (secs / 86_400) as i64;
    let rest = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60,
        ms % 1000
    )
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl Sink {
    pub fn new(path: PathBuf, max_bytes: u64, keep: usize) -> Self {
        Self {
            path,
            max_bytes,
            keep,
            file: Mutex::new(None),
        }
    }

    fn numbered(&self, n: usize) -> PathBuf {
        let mut name = self.path.clone().into_os_string();
        name.push(format!(".{n}"));
        PathBuf::from(name)
    }

    fn rotate(&self) -> io::Result<()> {
        let _ = std::fs::remove_file(self.numbered(self.keep));
        for n in (1..self.keep).rev() {
            let from = self.numbered(n);
            if from.exists() {
                std::fs::rename(&from, self.numbered(n + 1))?;
            }
        }
        std::fs::rename(&self.path, self.numbered(1))
    }

    pub fn write_line(&self, text: &str) -> io::Result<()> {
        let mut line = text.replace(['\r', '\n'], " ");
        if line.len() > MAX_LINE {
            let mut cut = MAX_LINE;
            while !line.is_char_boundary(cut) {
                cut -= 1;
            }
            line.truncate(cut);
            line.push('…');
        }
        line.push('\n');
        let mut slot = guard(&self.file);
        if slot.is_none() {
            *slot = Some(
                OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&self.path)?,
            );
        }
        let size = slot
            .as_ref()
            .and_then(|f| f.metadata().ok())
            .map_or(0, |m| m.len());
        if size + line.len() as u64 > self.max_bytes {
            *slot = None;
            self.rotate()?;
            *slot = Some(
                OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&self.path)?,
            );
        }
        match slot.as_mut() {
            Some(file) => file.write_all(line.as_bytes()),
            None => Ok(()),
        }
    }

    pub fn stamped(&self, level: &str, message: &str) {
        let _ = self.write_line(&format!("{} {level} {message}", iso(now_ms())));
    }
}

pub struct Limiter {
    per_second: u32,
    state: Mutex<(Instant, u32)>,
}

impl Limiter {
    pub fn new(per_second: u32) -> Self {
        Self {
            per_second,
            state: Mutex::new((Instant::now(), 0)),
        }
    }

    pub fn allow(&self) -> bool {
        let mut state = guard(&self.state);
        if state.0.elapsed() >= Duration::from_secs(1) {
            *state = (Instant::now(), 0);
        }
        if state.1 >= self.per_second {
            return false;
        }
        state.1 += 1;
        true
    }
}

pub struct Logs {
    pub webview: Sink,
    pub limiter: Limiter,
}

static SHELL: OnceLock<PathBuf> = OnceLock::new();
static SHELL_SINK: OnceLock<Sink> = OnceLock::new();

impl Logs {
    pub fn open(dir: &Path) -> Self {
        Self {
            webview: Sink::new(dir.join("webview.log"), MAX_BYTES, KEEP),
            limiter: Limiter::new(MAX_PER_SECOND),
        }
    }

    pub fn webview_event(&self, level: &str, message: &str) {
        if !self.limiter.allow() {
            return;
        }
        let level = match level {
            "error" | "warn" | "info" | "debug" | "log" | "uncaught" => level,
            _ => "log",
        };
        self.webview.stamped(level, message);
    }
}

pub fn install_shell(dir: &Path) {
    let _ = SHELL.set(dir.to_path_buf());
    let _ = SHELL_SINK.set(Sink::new(dir.join("shell.log"), MAX_BYTES, KEEP));
}

pub fn shell(message: &str) {
    eprintln!("{message}");
    if let Some(sink) = SHELL_SINK.get() {
        sink.stamped("shell", message);
    }
}

pub fn tail(dir: &Path, name: &str, lines: usize) -> Result<Vec<String>, String> {
    if !KNOWN.contains(&name) {
        return Err(format!("unknown log {name}; use one of {KNOWN:?}"));
    }
    let lines = lines.clamp(1, 2000);
    let path = dir.join(format!("{name}.log"));
    let mut file = match File::open(&path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let window = len.min(512 * 1024);
    file.seek(SeekFrom::Start(len - window))
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&bytes);
    let all: Vec<&str> = text.lines().collect();
    let skip = usize::from(window < len);
    let usable = &all[skip.min(all.len())..];
    let start = usable.len().saturating_sub(lines);
    Ok(usable[start..].iter().map(|s| s.to_string()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_timestamp_is_utc_iso() {
        assert_eq!(iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso(1_700_000_000_123), "2023-11-14T22:13:20.123Z");
    }

    #[test]
    fn a_full_file_rotates_and_only_the_newest_files_are_kept() {
        let dir = tempfile::tempdir().expect("temp dir");
        let sink = Sink::new(dir.path().join("x.log"), 40, 2);
        for n in 0..12 {
            sink.write_line(&format!("line number {n:02}"))
                .expect("write");
        }
        let names: Vec<String> = std::fs::read_dir(dir.path())
            .expect("dir")
            .map(|e| e.expect("entry").file_name().to_string_lossy().into_owned())
            .collect();
        assert!(names.contains(&"x.log".to_string()));
        assert!(names.contains(&"x.log.1".to_string()));
        assert!(names.contains(&"x.log.2".to_string()));
        assert!(!names.contains(&"x.log.3".to_string()));
        let current = std::fs::read_to_string(dir.path().join("x.log")).expect("read");
        assert!(current.contains("line number 11"));
    }

    #[test]
    fn a_long_line_is_cut_and_newlines_cannot_forge_entries() {
        let dir = tempfile::tempdir().expect("temp dir");
        let sink = Sink::new(dir.path().join("x.log"), MAX_BYTES, KEEP);
        sink.write_line(&format!("a\nb{}", "z".repeat(10_000)))
            .expect("write");
        let text = std::fs::read_to_string(dir.path().join("x.log")).expect("read");
        assert_eq!(text.lines().count(), 1);
        assert!(text.len() < MAX_LINE + 8);
    }

    #[test]
    fn the_limiter_caps_a_burst() {
        let limiter = Limiter::new(3);
        assert_eq!((0..5).filter(|_| limiter.allow()).count(), 3);
    }

    #[test]
    fn tail_returns_the_last_lines_and_refuses_unknown_names() {
        let dir = tempfile::tempdir().expect("temp dir");
        let logs = Logs::open(dir.path());
        for n in 0..5 {
            logs.webview_event("error", &format!("boom {n}"));
        }
        let lines = tail(dir.path(), "webview", 2).expect("tail");
        assert_eq!(lines.len(), 2);
        assert!(lines[1].ends_with("error boom 4"));
        assert_eq!(tail(dir.path(), "node", 5), Ok(Vec::new()));
        assert!(tail(dir.path(), "../etc", 5).is_err());
    }
}
