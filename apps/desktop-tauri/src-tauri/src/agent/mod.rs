pub mod commands;
pub mod connect;

use std::path::Path;
use std::sync::{Arc, Mutex};

use crate::profile::Paths;
use crate::sidecar::{Pairing, Sidecar, Spec, run_pair};

pub struct Agent {
    paths: Paths,
    sidecar: Option<Arc<Sidecar>>,
    pair_spec: Option<Spec>,
    pairing: Arc<Mutex<Pairing>>,
}

impl Agent {
    pub fn new(paths: Paths, sidecar: Option<Arc<Sidecar>>, pair_spec: Option<Spec>) -> Self {
        Self {
            paths,
            sidecar,
            pair_spec,
            pairing: Arc::new(Mutex::new(Pairing::Idle)),
        }
    }

    pub fn paths(&self) -> &Paths {
        &self.paths
    }

    pub fn profile_dir(&self) -> &Path {
        self.paths.root()
    }

    pub fn sidecar(&self) -> Option<&Arc<Sidecar>> {
        self.sidecar.as_ref()
    }

    pub fn pairing(&self) -> Pairing {
        self.pairing
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn start_pairing(&self) -> Result<(), String> {
        let (Some(sidecar), Some(spec)) = (self.sidecar.clone(), self.pair_spec.clone()) else {
            return Err("The dou-cli sidecar was not found next to the app.".to_string());
        };
        {
            let mut state = self.pairing.lock().unwrap_or_else(|p| p.into_inner());
            if matches!(
                *state,
                Pairing::Starting | Pairing::Waiting { .. } | Pairing::Applying
            ) {
                return Err("A pairing is already running.".to_string());
            }
            *state = Pairing::Starting;
        }
        let pairing = Arc::clone(&self.pairing);
        std::thread::spawn(move || {
            let set = |value: Pairing| {
                *pairing.lock().unwrap_or_else(|p| p.into_inner()) = value;
            };
            if !sidecar.pause() {
                set(Pairing::Failed {
                    message: "dou-cli did not stop in time.".to_string(),
                });
                sidecar.resume();
                return;
            }
            let ended = run_pair(&spec, &set);
            set(ended);
            sidecar.resume();
        });
        Ok(())
    }

    pub fn shutdown(&self) {
        if let Some(sidecar) = &self.sidecar {
            sidecar.stop();
        }
    }
}
