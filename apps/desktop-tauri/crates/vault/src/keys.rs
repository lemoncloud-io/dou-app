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
