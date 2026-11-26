use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use dou_core::{Error, Result};

use crate::token::TokenView;

pub struct Profile {
    dir: PathBuf,
}

fn io_error(error: std::io::Error) -> Error {
    Error::Storage(error.to_string())
}

impl Profile {
    pub fn open(dir: impl Into<PathBuf>) -> Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir).map_err(io_error)?;
        restrict(&dir, 0o700)?;
        Ok(Self { dir })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn device_id(&self) -> Result<String> {
        let path = self.dir.join("device-id");
        if let Ok(existing) = fs::read_to_string(&path) {
            let existing = existing.trim();
            if !existing.is_empty() {
                return Ok(existing.to_string());
            }
        }
        let fresh = format!("desktop-native-{}", uuid::Uuid::new_v4());
        write_private(&path, fresh.as_bytes())?;
        Ok(fresh)
    }

    pub fn load_relay_token(&self) -> Result<Option<TokenView>> {
        match fs::read_to_string(self.dir.join("relay-token.json")) {
            Ok(text) => serde_json::from_str(&text)
                .map(Some)
                .map_err(|e| Error::Storage(format!("relay-token.json: {e}"))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(io_error(e)),
        }
    }

    pub fn save_relay_token(&self, view: &TokenView) -> Result<()> {
        let text = serde_json::to_vec_pretty(view).map_err(|e| Error::Storage(e.to_string()))?;
        write_private(&self.dir.join("relay-token.json"), &text)
    }

    pub fn clear_session(&self) -> Result<()> {
        match fs::remove_file(self.dir.join("relay-token.json")) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(io_error(e)),
        }
    }
}

pub fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&tmp).map_err(io_error)?;
        restrict(&tmp, 0o600)?;
        file.write_all(bytes).map_err(io_error)?;
        file.sync_all().map_err(io_error)?;
    }
    fs::rename(&tmp, path).map_err(io_error)
}

#[cfg(unix)]
fn restrict(path: &Path, mode: u32) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).map_err(io_error)
}

#[cfg(not(unix))]
fn restrict(_path: &Path, _mode: u32) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dou-auth-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_device_id_is_created_once_and_kept() {
        let profile = Profile::open(scratch("device")).unwrap();
        let first = profile.device_id().unwrap();
        assert_eq!(profile.device_id().unwrap(), first);
    }

    #[test]
    fn a_saved_token_is_read_back_and_cleared() {
        let profile = Profile::open(scratch("token")).unwrap();
        assert!(profile.load_relay_token().unwrap().is_none());
        let view = TokenView {
            id: Some("u1".into()),
            ..TokenView::default()
        };
        profile.save_relay_token(&view).unwrap();
        assert_eq!(profile.load_relay_token().unwrap(), Some(view));
        profile.clear_session().unwrap();
        assert!(profile.load_relay_token().unwrap().is_none());
    }

    #[cfg(unix)]
    #[test]
    fn the_token_file_is_private_to_the_user() {
        use std::os::unix::fs::PermissionsExt;
        let profile = Profile::open(scratch("mode")).unwrap();
        profile.save_relay_token(&TokenView::default()).unwrap();
        let mode = fs::metadata(profile.dir().join("relay-token.json"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}
