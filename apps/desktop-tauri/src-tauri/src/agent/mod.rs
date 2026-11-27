pub mod commands;
pub mod connect;

use std::path::{Path, PathBuf};

pub struct Agent {
    profile_dir: PathBuf,
}

impl Agent {
    pub fn new(profile_dir: PathBuf) -> Self {
        Self { profile_dir }
    }

    pub fn profile_dir(&self) -> &Path {
        &self.profile_dir
    }
}
