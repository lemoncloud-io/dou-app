use std::fs::{File, TryLockError};
use std::io;
use std::path::{Path, PathBuf};

pub const SCHEMES: [&str; 2] = ["chatic", "chatic-dev"];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Cli {
    pub profile: Option<PathBuf>,
    pub app: Option<String>,
    pub deep_links: Vec<String>,
}

fn flag_value(args: &[String], at: usize, name: &str) -> Option<(String, usize)> {
    let arg = &args[at];
    if arg == name {
        return args.get(at + 1).map(|value| (value.clone(), 2));
    }
    arg.strip_prefix(name)
        .and_then(|rest| rest.strip_prefix('='))
        .map(|value| (value.to_string(), 1))
}

pub fn is_deep_link(arg: &str) -> bool {
    SCHEMES.iter().any(|scheme| {
        arg.strip_prefix(scheme)
            .is_some_and(|r| r.starts_with("://"))
    })
}

pub fn parse_args(args: &[String]) -> Result<Cli, String> {
    let mut cli = Cli::default();
    let mut at = 0;
    while at < args.len() {
        if args[at] == "--profile" && at + 1 >= args.len() {
            return Err("--profile needs a folder".to_string());
        }
        if args[at] == "--app" && at + 1 >= args.len() {
            return Err("--app needs a folder or a URL".to_string());
        }
        if let Some((value, used)) = flag_value(args, at, "--profile") {
            if value.is_empty() {
                return Err("--profile needs a folder".to_string());
            }
            cli.profile = Some(PathBuf::from(value));
            at += used;
        } else if let Some((value, used)) = flag_value(args, at, "--app") {
            if value.is_empty() {
                return Err("--app needs a folder or a URL".to_string());
            }
            cli.app = Some(value);
            at += used;
        } else {
            if is_deep_link(&args[at]) {
                cli.deep_links.push(args[at].clone());
            }
            at += 1;
        }
    }
    Ok(cli)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Paths {
    root: PathBuf,
}

impl Paths {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn prepare(root: &Path) -> io::Result<Self> {
        create_private_dir(root)?;
        let root = root.canonicalize()?;
        let paths = Self { root };
        for dir in [paths.webview_dir(), paths.node_dir(), paths.logs_dir()] {
            create_private_dir(&dir)?;
        }
        Ok(paths)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn app_json(&self) -> PathBuf {
        self.root.join("app.json")
    }

    pub fn webview_dir(&self) -> PathBuf {
        self.root.join("webview")
    }

    pub fn node_dir(&self) -> PathBuf {
        self.root.join("node")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }

    pub fn shell_sock(&self) -> PathBuf {
        self.root.join("shell.sock")
    }

    #[cfg(windows)]
    pub fn shell_pipe(&self) -> PathBuf {
        self.root.join("shell.pipe")
    }

    pub fn lock_file(&self) -> PathBuf {
        self.root.join("shell.lock")
    }

    pub fn device_id(&self) -> PathBuf {
        self.root.join("device-id")
    }

    pub fn vault_key(&self) -> PathBuf {
        self.root.join("vault.key")
    }

    pub fn secrets(&self) -> PathBuf {
        self.root.join("secrets.bin")
    }

    pub fn store_identifier(&self) -> [u8; 16] {
        *uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            self.root.to_string_lossy().as_bytes(),
        )
        .as_bytes()
    }
}

#[cfg(unix)]
fn create_private_dir(dir: &Path) -> io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, PermissionsExt};
    let existed = dir.is_dir();
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)?;
    if existed {
        return Ok(());
    }
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn create_private_dir(dir: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dir)
}

#[derive(Debug)]
pub enum LockError {
    Held,
    Io(io::Error),
}

pub struct Lock {
    _file: File,
}

impl Lock {
    pub fn acquire(paths: &Paths) -> Result<Self, LockError> {
        let file = File::options()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(paths.lock_file())
            .map_err(LockError::Io)?;
        match file.try_lock() {
            Ok(()) => Ok(Self { _file: file }),
            Err(TryLockError::WouldBlock) => Err(LockError::Held),
            Err(TryLockError::Error(error)) => Err(LockError::Io(error)),
        }
    }

    pub fn acquire_within(paths: &Paths, wait: std::time::Duration) -> Result<Self, LockError> {
        let deadline = std::time::Instant::now() + wait;
        loop {
            match Self::acquire(paths) {
                Err(LockError::Held) if std::time::Instant::now() < deadline => {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                other => return other,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_flags_are_read_with_a_space_or_an_equals_sign() {
        let cli = parse_args(&args(&["dou", "--profile", "/p", "--app=./dist"])).expect("parse");
        assert_eq!(cli.profile, Some(PathBuf::from("/p")));
        assert_eq!(cli.app.as_deref(), Some("./dist"));
    }

    #[test]
    fn a_flag_without_a_value_is_refused() {
        assert!(parse_args(&args(&["dou", "--profile"])).is_err());
        assert!(parse_args(&args(&["dou", "--app="])).is_err());
    }

    #[test]
    fn deep_links_are_collected_and_other_arguments_are_ignored() {
        let cli = parse_args(&args(&[
            "dou",
            "chatic://login?code=1",
            "https://x",
            "--other",
        ]))
        .expect("parse");
        assert_eq!(cli.deep_links, ["chatic://login?code=1"]);
        assert!(is_deep_link("chatic-dev://a"));
        assert!(!is_deep_link("chaticx://a"));
        assert!(!is_deep_link("chatic:/a"));
    }

    #[test]
    fn prepare_makes_the_layout_and_the_lock_is_per_profile() {
        let dir = tempfile::tempdir().expect("temp dir");
        let one = Paths::prepare(&dir.path().join("one")).expect("one");
        let two = Paths::prepare(&dir.path().join("two")).expect("two");
        assert!(one.webview_dir().is_dir() && one.node_dir().is_dir() && one.logs_dir().is_dir());
        let first = Lock::acquire(&one).expect("first");
        assert!(matches!(Lock::acquire(&one), Err(LockError::Held)));
        let other = Lock::acquire(&two).expect("a different profile is free");
        drop(first);
        assert!(Lock::acquire(&one).is_ok());
        drop(other);
    }

    #[test]
    fn the_store_identifier_depends_on_the_profile_path() {
        let a = Paths::new("/a");
        assert_eq!(a.store_identifier(), Paths::new("/a").store_identifier());
        assert_ne!(a.store_identifier(), Paths::new("/b").store_identifier());
    }

    #[cfg(unix)]
    #[test]
    fn the_profile_folder_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("temp dir");
        let paths = Paths::prepare(&dir.path().join("p")).expect("prepare");
        let mode = std::fs::metadata(paths.root())
            .expect("meta")
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o700);
    }
}
