use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};

use crate::keys::KeySource;

const NONCE_LEN: usize = 12;

type Values = BTreeMap<String, String>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Snapshot {
    Available { values: Values, reset: bool },
    Unavailable,
}

enum State {
    Unread,
    Available { values: Values, reset: bool },
    Unavailable,
}

pub struct Vault {
    path: PathBuf,
    keys: Box<dyn KeySource>,
    state: Mutex<State>,
}

fn encrypt(key: &[u8; 32], plain: &[u8]) -> Result<Vec<u8>, String> {
    let mut nonce = [0u8; NONCE_LEN];
    getrandom::fill(&mut nonce).map_err(|e| e.to_string())?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(key));
    let sealed = cipher
        .encrypt(Nonce::from_slice(&nonce), plain)
        .map_err(|_| "encryption failed".to_string())?;
    let mut out = nonce.to_vec();
    out.extend(sealed);
    Ok(out)
}

fn decrypt(key: &[u8; 32], bytes: &[u8]) -> Option<Vec<u8>> {
    if bytes.len() <= NONCE_LEN {
        return None;
    }
    let (nonce, sealed) = bytes.split_at(NONCE_LEN);
    ChaCha20Poly1305::new(Key::from_slice(key))
        .decrypt(Nonce::from_slice(nonce), sealed)
        .ok()
}

fn parse_record(plain: &[u8]) -> Option<Values> {
    match serde_json::from_slice::<serde_json::Value>(plain).ok()? {
        serde_json::Value::Object(map) => map
            .into_iter()
            .map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
            .collect(),
        _ => None,
    }
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut temp = path.as_os_str().to_owned();
    temp.push(".tmp");
    let temp = PathBuf::from(temp);
    let written = fs::write(&temp, bytes).and_then(|_| fs::rename(&temp, path));
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|p| p.into_inner())
}

impl Vault {
    pub fn open(path: impl Into<PathBuf>, keys: Box<dyn KeySource>) -> Self {
        Self {
            path: path.into(),
            keys,
            state: Mutex::new(State::Unread),
        }
    }

    fn loaded<'a>(&self, state: &'a mut State) -> &'a mut State {
        if matches!(state, State::Unread) {
            *state = Self::read(&self.path, self.keys.as_ref());
        }
        state
    }

    fn read(path: &Path, keys: &dyn KeySource) -> State {
        let Ok(key) = keys.key() else {
            return State::Unavailable;
        };
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                return State::Available {
                    values: Values::new(),
                    reset: false,
                };
            }
            Err(_) => return State::Unavailable,
        };
        match decrypt(&key, &bytes).as_deref().and_then(parse_record) {
            Some(values) => State::Available {
                values,
                reset: false,
            },
            None => {
                let _ = fs::remove_file(path);
                State::Available {
                    values: Values::new(),
                    reset: true,
                }
            }
        }
    }

    pub fn get(&self) -> Snapshot {
        let mut guard = lock(&self.state);
        match &*self.loaded(&mut guard) {
            State::Unread => Snapshot::Unavailable,
            State::Available { values, reset } => Snapshot::Available {
                values: values.clone(),
                reset: *reset,
            },
            State::Unavailable => Snapshot::Unavailable,
        }
    }

    pub fn save(&self, set: &Values, remove: &[String]) -> bool {
        let mut guard = lock(&self.state);
        let state = self.loaded(&mut guard);
        let State::Available { values, .. } = &*state else {
            return false;
        };
        let mut next = values.clone();
        next.extend(set.iter().map(|(k, v)| (k.clone(), v.clone())));
        for key in remove {
            next.remove(key);
        }
        let written = serde_json::to_vec(&next)
            .map_err(|e| e.to_string())
            .and_then(|plain| {
                let key = self.keys.key()?;
                encrypt(&key, &plain)
            })
            .and_then(|sealed| write_atomic(&self.path, &sealed).map_err(|e| e.to_string()));
        match written {
            Ok(()) => {
                *state = State::Available {
                    values: next,
                    reset: false,
                };
                true
            }
            Err(_) => {
                *state = State::Unavailable;
                false
            }
        }
    }

    pub fn clear(&self) -> bool {
        let mut guard = lock(&self.state);
        let state = self.loaded(&mut guard);
        match fs::remove_file(&self.path) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(_) => return false,
        }
        if matches!(&*state, State::Available { .. }) {
            *state = State::Available {
                values: Values::new(),
                reset: false,
            };
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixed([u8; 32]);
    impl KeySource for Fixed {
        fn key(&self) -> Result<[u8; 32], String> {
            Ok(self.0)
        }
    }

    struct Broken;
    impl KeySource for Broken {
        fn key(&self) -> Result<[u8; 32], String> {
            Err("no keychain".into())
        }
    }

    fn map(pairs: &[(&str, &str)]) -> Values {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn fresh() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("secrets.bin");
        (dir, path)
    }

    #[test]
    fn a_new_vault_is_available_and_empty() {
        let (_dir, path) = fresh();
        let vault = Vault::open(&path, Box::new(Fixed([1; 32])));
        assert_eq!(
            vault.get(),
            Snapshot::Available {
                values: Values::new(),
                reset: false
            }
        );
    }

    #[test]
    fn saved_values_survive_a_reopen_and_are_not_plain_on_disk() {
        let (_dir, path) = fresh();
        let vault = Vault::open(&path, Box::new(Fixed([1; 32])));
        assert!(vault.save(&map(&[("token", "s3cret-value")]), &[]));
        let raw = fs::read(&path).expect("file");
        assert!(!String::from_utf8_lossy(&raw).contains("s3cret-value"));

        let again = Vault::open(&path, Box::new(Fixed([1; 32])));
        assert_eq!(
            again.get(),
            Snapshot::Available {
                values: map(&[("token", "s3cret-value")]),
                reset: false
            }
        );
    }

    #[test]
    fn save_merges_and_removes() {
        let (_dir, path) = fresh();
        let vault = Vault::open(&path, Box::new(Fixed([1; 32])));
        assert!(vault.save(&map(&[("a", "1"), ("b", "2")]), &[]));
        assert!(vault.save(&map(&[("c", "3")]), &["a".to_string()]));
        assert_eq!(
            vault.get(),
            Snapshot::Available {
                values: map(&[("b", "2"), ("c", "3")]),
                reset: false
            }
        );
    }

    #[test]
    fn a_vault_under_another_key_is_deleted_and_starts_empty_with_reset() {
        let (_dir, path) = fresh();
        assert!(Vault::open(&path, Box::new(Fixed([1; 32]))).save(&map(&[("a", "1")]), &[]));

        let other = Vault::open(&path, Box::new(Fixed([2; 32])));
        assert_eq!(
            other.get(),
            Snapshot::Available {
                values: Values::new(),
                reset: true
            }
        );
        assert!(!path.exists());
        assert!(other.save(&map(&[("b", "2")]), &[]));
        assert_eq!(
            other.get(),
            Snapshot::Available {
                values: map(&[("b", "2")]),
                reset: false
            }
        );
    }

    #[test]
    fn a_corrupt_file_resets() {
        let (_dir, path) = fresh();
        fs::write(&path, b"garbage garbage garbage").expect("write");
        let vault = Vault::open(&path, Box::new(Fixed([1; 32])));
        assert_eq!(
            vault.get(),
            Snapshot::Available {
                values: Values::new(),
                reset: true
            }
        );
    }

    #[test]
    fn a_record_that_is_not_all_strings_resets() {
        let (_dir, path) = fresh();
        let sealed = encrypt(&[1; 32], br#"{"a": 1}"#).expect("encrypt");
        fs::write(&path, sealed).expect("write");
        let vault = Vault::open(&path, Box::new(Fixed([1; 32])));
        assert!(matches!(
            vault.get(),
            Snapshot::Available { reset: true, .. }
        ));
    }

    #[test]
    fn without_a_key_the_vault_is_unavailable_and_refuses_writes() {
        let (_dir, path) = fresh();
        let vault = Vault::open(&path, Box::new(Broken));
        assert_eq!(vault.get(), Snapshot::Unavailable);
        assert!(!vault.save(&map(&[("a", "1")]), &[]));
        assert!(!path.exists());
    }

    #[test]
    fn a_failed_write_leaves_the_vault_unavailable_and_no_temp_file() {
        let (dir, _path) = fresh();
        let blocked = dir.path().join("blocked");
        fs::create_dir(&blocked).expect("dir");
        let vault = Vault::open(&blocked, Box::new(Fixed([1; 32])));
        assert_eq!(vault.get(), Snapshot::Unavailable);

        let (_d2, path2) = fresh();
        let vault2 = Vault::open(&path2, Box::new(Fixed([1; 32])));
        fs::create_dir(&path2).expect("dir in the way");
        assert!(!vault2.save(&map(&[("a", "1")]), &[]));
        assert_eq!(vault2.get(), Snapshot::Unavailable);
        assert!(!path2.with_extension("bin.tmp").exists());
    }

    #[test]
    fn clear_deletes_the_file_and_empties_memory() {
        let (_dir, path) = fresh();
        let vault = Vault::open(&path, Box::new(Fixed([1; 32])));
        assert!(vault.save(&map(&[("a", "1")]), &[]));
        assert!(vault.clear());
        assert!(!path.exists());
        assert_eq!(
            vault.get(),
            Snapshot::Available {
                values: Values::new(),
                reset: false
            }
        );
        assert!(vault.clear());
    }
}
