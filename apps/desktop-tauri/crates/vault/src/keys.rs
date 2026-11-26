use keyring::Entry;

pub trait KeySource: Send + Sync {
    fn key(&self) -> Result<[u8; 32], String>;
}

pub struct KeyringKeys {
    service: String,
    account: String,
}

impl KeyringKeys {
    pub fn new(service: &str, account: &str) -> Self {
        Self {
            service: service.to_string(),
            account: account.to_string(),
        }
    }
}

impl KeySource for KeyringKeys {
    fn key(&self) -> Result<[u8; 32], String> {
        let entry = Entry::new(&self.service, &self.account).map_err(|e| e.to_string())?;
        match entry.get_secret() {
            Ok(secret) => <[u8; 32]>::try_from(secret.as_slice())
                .map_err(|_| "the stored vault key has the wrong length".to_string()),
            Err(keyring::Error::NoEntry) => {
                let mut fresh = [0u8; 32];
                getrandom::fill(&mut fresh).map_err(|e| e.to_string())?;
                entry.set_secret(&fresh).map_err(|e| e.to_string())?;
                Ok(fresh)
            }
            Err(error) => Err(error.to_string()),
        }
    }
}

pub struct FileKeys {
    path: std::path::PathBuf,
}

impl FileKeys {
    pub fn new(path: impl Into<std::path::PathBuf>) -> Self {
        Self { path: path.into() }
    }
}

impl KeySource for FileKeys {
    fn key(&self) -> Result<[u8; 32], String> {
        match std::fs::read(&self.path) {
            Ok(bytes) => <[u8; 32]>::try_from(bytes.as_slice())
                .map_err(|_| "the vault key file has the wrong length".to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let mut fresh = [0u8; 32];
                getrandom::fill(&mut fresh).map_err(|e| e.to_string())?;
                if let Some(dir) = self.path.parent() {
                    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
                }
                write_private(&self.path, &fresh).map_err(|e| e.to_string())?;
                Ok(fresh)
            }
            Err(error) => Err(error.to_string()),
        }
    }
}

fn write_private(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)?.write_all(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_file_key_is_created_once_and_read_back() {
        let dir = tempfile::tempdir().expect("temp dir");
        let keys = FileKeys::new(dir.path().join("sub").join("vault.key"));
        let first = keys.key().expect("create");
        assert_eq!(keys.key().expect("read"), first);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.path().join("sub").join("vault.key"))
                .expect("meta")
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }

    #[test]
    fn a_key_file_of_the_wrong_length_is_refused() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("vault.key");
        std::fs::write(&path, b"short").expect("write");
        assert!(FileKeys::new(path).key().is_err());
    }
}
