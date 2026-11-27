use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use crate::logs::{self, Sink};
use crate::profile::Paths;

const POLL: Duration = Duration::from_millis(100);
const STABLE_AFTER: Duration = Duration::from_secs(60);
const MAX_FAILURES: u32 = 8;
const MAX_DELAY: Duration = Duration::from_secs(30);
const PAUSE_WAIT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spec {
    pub program: PathBuf,
    pub args: Vec<String>,
}

fn executable_name() -> &'static str {
    if cfg!(windows) {
        "dou-cli.exe"
    } else {
        "dou-cli"
    }
}

fn profile_args(paths: &Paths, command: &str) -> Vec<String> {
    let mut args = vec!["--profile".to_string(), paths.root().display().to_string()];
    if paths.dou_env().is_file() {
        args.push("--env-file".to_string());
        args.push(paths.dou_env().display().to_string());
    }
    args.push("--parent-pipe".to_string());
    args.push(command.to_string());
    args
}

pub fn locate(
    paths: &Paths,
    exe_dir: &Path,
    env: &dyn Fn(&str) -> Option<String>,
    command: &str,
) -> Option<Spec> {
    let tail = profile_args(paths, command);
    if let Some(script) = env("DOU_CLI_NODE_SCRIPT") {
        let mut args = vec![script];
        args.extend(tail);
        return Some(Spec {
            program: PathBuf::from(env("DOU_CLI_NODE").unwrap_or_else(|| "node".to_string())),
            args,
        });
    }
    let program = env("DOU_CLI_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(|| exe_dir.join(executable_name()));
    program.is_file().then_some(Spec {
        program,
        args: tail,
    })
}

#[derive(Debug, Default)]
pub struct Backoff {
    failures: u32,
}

impl Backoff {
    pub fn next(&mut self, ran: Duration) -> Option<Duration> {
        if ran >= STABLE_AFTER {
            self.failures = 0;
        }
        self.failures += 1;
        if self.failures > MAX_FAILURES {
            return None;
        }
        Some((Duration::from_secs(1) * (1 << (self.failures - 1).min(5))).min(MAX_DELAY))
    }

    pub fn reset(&mut self) {
        self.failures = 0;
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Status {
    Starting,
    Running,
    Paused,
    Failed(String),
    Stopped,
}

struct Shared {
    spec: Spec,
    sink: Arc<Sink>,
    stop: AtomicBool,
    paused: AtomicBool,
    reset: AtomicBool,
    status: Mutex<Status>,
}

impl Shared {
    fn set(&self, status: Status) {
        *self.status.lock().unwrap_or_else(|p| p.into_inner()) = status;
    }

    fn halted(&self) -> bool {
        self.stop.load(Ordering::SeqCst) || self.paused.load(Ordering::SeqCst)
    }
}

pub struct Sidecar {
    shared: Arc<Shared>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

fn for_each_line(stream: impl Read, mut each: impl FnMut(String)) {
    let mut reader = BufReader::new(stream);
    let mut buffer = Vec::new();
    loop {
        buffer.clear();
        match reader.read_until(b'\n', &mut buffer) {
            Ok(0) | Err(_) => return,
            Ok(_) => each(
                String::from_utf8_lossy(&buffer)
                    .trim_end_matches(['\n', '\r'])
                    .to_string(),
            ),
        }
    }
}

fn pipe_lines(sink: &Arc<Sink>, level: &'static str, stream: impl Read + Send + 'static) {
    let sink = Arc::clone(sink);
    std::thread::spawn(move || {
        for_each_line(stream, |line| sink.stamped(level, &line));
    });
}

fn spawn(spec: &Spec, sink: &Arc<Sink>) -> std::io::Result<Child> {
    let mut child = Command::new(&spec.program)
        .args(&spec.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(out) = child.stdout.take() {
        pipe_lines(sink, "out", out);
    }
    if let Some(err) = child.stderr.take() {
        pipe_lines(sink, "err", err);
    }
    Ok(child)
}

fn sleep_unless_halted(shared: &Shared, total: Duration) {
    let end = Instant::now() + total;
    while Instant::now() < end && !shared.halted() && !shared.reset.load(Ordering::SeqCst) {
        std::thread::sleep(POLL);
    }
}

fn supervise(shared: Arc<Shared>) {
    let mut backoff = Backoff::default();
    while !shared.stop.load(Ordering::SeqCst) {
        if shared.reset.swap(false, Ordering::SeqCst) {
            backoff.reset();
        }
        if shared.paused.load(Ordering::SeqCst) {
            shared.set(Status::Paused);
            std::thread::sleep(POLL);
            continue;
        }
        let started = Instant::now();
        shared.set(Status::Starting);
        match spawn(&shared.spec, &shared.sink) {
            Ok(mut child) => {
                shared.set(Status::Running);
                loop {
                    if shared.halted() {
                        let _ = child.kill();
                        let _ = child.wait();
                        break;
                    }
                    match child.try_wait() {
                        Ok(None) => std::thread::sleep(POLL),
                        Ok(Some(status)) => {
                            logs::shell(&format!("dou-cli exited: {status}"));
                            break;
                        }
                        Err(error) => {
                            logs::shell(&format!("dou-cli wait failed: {error}"));
                            break;
                        }
                    }
                }
            }
            Err(error) => logs::shell(&format!("dou-cli did not start: {error}")),
        }
        if shared.halted() {
            continue;
        }
        match backoff.next(started.elapsed()) {
            Some(delay) => {
                shared.set(Status::Failed("dou-cli stopped; restarting".to_string()));
                sleep_unless_halted(&shared, delay);
            }
            None => {
                let message = "dou-cli keeps stopping; see logs/node.log".to_string();
                logs::shell(&message);
                shared.set(Status::Failed(message));
                while !shared.halted() && !shared.reset.load(Ordering::SeqCst) {
                    std::thread::sleep(POLL);
                }
            }
        }
    }
    shared.set(Status::Stopped);
}

impl Sidecar {
    pub fn start(spec: Spec, sink: Arc<Sink>) -> Self {
        let shared = Arc::new(Shared {
            spec,
            sink,
            stop: AtomicBool::new(false),
            paused: AtomicBool::new(false),
            reset: AtomicBool::new(false),
            status: Mutex::new(Status::Starting),
        });
        let worker = {
            let shared = Arc::clone(&shared);
            std::thread::spawn(move || supervise(shared))
        };
        Self {
            shared,
            worker: Mutex::new(Some(worker)),
        }
    }

    pub fn status(&self) -> Status {
        self.shared
            .status
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn pause(&self) -> bool {
        self.shared.paused.store(true, Ordering::SeqCst);
        let end = Instant::now() + PAUSE_WAIT;
        while Instant::now() < end {
            if self.status() == Status::Paused {
                return true;
            }
            std::thread::sleep(POLL);
        }
        false
    }

    pub fn resume(&self) {
        self.shared.reset.store(true, Ordering::SeqCst);
        self.shared.paused.store(false, Ordering::SeqCst);
    }

    pub fn stop(&self) {
        self.shared.stop.store(true, Ordering::SeqCst);
        let worker = self.worker.lock().unwrap_or_else(|p| p.into_inner()).take();
        if let Some(worker) = worker {
            let _ = worker.join();
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Pairing {
    Idle,
    Starting,
    Waiting { code: String },
    Applying,
    Failed { message: String },
}

const CODE_PREFIX: &str = "pairing code: ";

pub fn parse_pair_line(line: &str) -> Option<Pairing> {
    if let Some(code) = line.trim().strip_prefix(CODE_PREFIX) {
        return Some(Pairing::Waiting {
            code: code.trim().to_string(),
        });
    }
    let value: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    (value["paired"] == true).then_some(Pairing::Applying)
}

pub fn run_pair(spec: &Spec, mut on_state: impl FnMut(Pairing)) -> Pairing {
    on_state(Pairing::Starting);
    let mut child = match Command::new(&spec.program)
        .args(&spec.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) => {
            return Pairing::Failed {
                message: format!("dou-cli did not start: {error}"),
            };
        }
    };
    let errors = child.stderr.take().map(|stream| {
        std::thread::spawn(move || {
            let mut last = String::new();
            for_each_line(stream, |line| last = line);
            last
        })
    });
    let mut paired = false;
    if let Some(out) = child.stdout.take() {
        for_each_line(out, |line| {
            if let Some(state) = parse_pair_line(&line) {
                paired = state == Pairing::Applying;
                on_state(state);
            }
        });
    }
    let status = child.wait();
    let last_error = errors
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    match status {
        Ok(status) if status.success() && paired => Pairing::Idle,
        Ok(status) => Pairing::Failed {
            message: if last_error.is_empty() {
                format!("pairing ended: {status}")
            } else {
                last_error
            },
        },
        Err(error) => Pairing::Failed {
            message: error.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths() -> (tempfile::TempDir, Paths) {
        let dir = tempfile::tempdir().expect("temp dir");
        let paths = Paths::new(dir.path());
        (dir, paths)
    }

    #[cfg(unix)]
    fn sink(paths: &Paths) -> Arc<Sink> {
        Arc::new(Sink::new(
            paths.root().join("node.log"),
            logs::MAX_BYTES,
            logs::KEEP,
        ))
    }

    #[test]
    fn the_backoff_doubles_to_a_cap_gives_up_and_forgets_a_stable_run() {
        let mut backoff = Backoff::default();
        let delays: Vec<_> = (0..8).map(|_| backoff.next(Duration::ZERO)).collect();
        assert_eq!(delays[0], Some(Duration::from_secs(1)));
        assert_eq!(delays[1], Some(Duration::from_secs(2)));
        assert_eq!(delays[5], Some(Duration::from_secs(30)));
        assert_eq!(backoff.next(Duration::ZERO), None);
        assert_eq!(backoff.next(STABLE_AFTER), Some(Duration::from_secs(1)));
    }

    #[test]
    fn locate_prefers_the_node_script_then_the_binary_then_the_one_beside_the_app() {
        let (dir, paths) = paths();
        let none = |_: &str| None;
        assert_eq!(locate(&paths, dir.path(), &none, "serve"), None);

        let script = |key: &str| (key == "DOU_CLI_NODE_SCRIPT").then(|| "/x/main.mjs".to_string());
        let spec = locate(&paths, dir.path(), &script, "serve").expect("script");
        assert_eq!(spec.program, PathBuf::from("node"));
        assert_eq!(spec.args[0], "/x/main.mjs");
        assert_eq!(spec.args[1], "--profile");
        assert_eq!(spec.args.last().map(String::as_str), Some("serve"));

        std::fs::write(dir.path().join(executable_name()), "").expect("write");
        let beside = locate(&paths, dir.path(), &none, "pair").expect("beside");
        assert_eq!(beside.program, dir.path().join(executable_name()));
        assert!(!beside.args.contains(&"--env-file".to_string()));

        std::fs::write(paths.dou_env(), "").expect("env");
        let with_env = locate(&paths, dir.path(), &none, "serve").expect("env");
        assert!(with_env.args.contains(&"--env-file".to_string()));
    }

    #[test]
    fn lines_survive_bytes_that_are_not_utf8() {
        let mut seen = Vec::new();
        for_each_line(&b"bad \xff byte\r\nnext\n"[..], |line| seen.push(line));
        assert_eq!(seen, ["bad \u{fffd} byte", "next"]);
    }

    #[test]
    fn pairing_lines_are_read_for_the_code_and_the_result() {
        assert_eq!(
            parse_pair_line("pairing code: AB-12"),
            Some(Pairing::Waiting {
                code: "AB-12".to_string()
            })
        );
        assert_eq!(
            parse_pair_line("{\"paired\":true,\"target\":{}}"),
            Some(Pairing::Applying)
        );
        assert_eq!(parse_pair_line("{\"paired\":false}"), None);
        assert_eq!(parse_pair_line("hello"), None);
    }

    #[cfg(unix)]
    fn script(body: &str) -> Spec {
        Spec {
            program: PathBuf::from("sh"),
            args: vec!["-c".to_string(), body.to_string()],
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_pair_run_reports_the_code_then_succeeds() {
        let spec = script("echo 'pairing code: AB-12'; echo '{\"paired\":true}'");
        let mut seen = Vec::new();
        let ended = run_pair(&spec, |state| seen.push(state));
        assert_eq!(ended, Pairing::Idle);
        assert_eq!(
            seen,
            [
                Pairing::Starting,
                Pairing::Waiting {
                    code: "AB-12".to_string()
                },
                Pairing::Applying
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_denied_pair_run_fails_with_the_last_error_line() {
        let spec = script("echo 'pairing code: AB-12'; echo 'pairing denied' >&2; exit 1");
        let ended = run_pair(&spec, |_| {});
        assert_eq!(
            ended,
            Pairing::Failed {
                message: "pairing denied".to_string()
            }
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_sidecar_starts_pauses_resumes_and_stops_its_child() {
        let (_dir, paths) = paths();
        let marker = paths.root().join("starts");
        let spec = script(&format!("echo x >> {}; sleep 30", marker.display()));
        let sidecar = Sidecar::start(spec, sink(&paths));
        let end = Instant::now() + Duration::from_secs(5);
        while !marker.exists() && Instant::now() < end {
            std::thread::sleep(POLL);
        }
        assert!(marker.exists());
        assert_eq!(sidecar.status(), Status::Running);
        assert!(sidecar.pause());
        assert_eq!(sidecar.status(), Status::Paused);
        sidecar.resume();
        let end = Instant::now() + Duration::from_secs(5);
        while std::fs::read_to_string(&marker).map_or(0, |t| t.lines().count()) < 2
            && Instant::now() < end
        {
            std::thread::sleep(POLL);
        }
        assert!(
            std::fs::read_to_string(&marker)
                .expect("marker")
                .lines()
                .count()
                >= 2
        );
        sidecar.stop();
        assert_eq!(sidecar.status(), Status::Stopped);
    }
}
