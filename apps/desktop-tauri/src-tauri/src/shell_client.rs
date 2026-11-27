use std::io::{BufRead, BufReader, Write};

use serde_json::{Value, json};

use crate::profile::Paths;

#[cfg(unix)]
fn connect(paths: &Paths) -> Result<impl std::io::Read + Write, String> {
    let stream = std::os::unix::net::UnixStream::connect(paths.shell_sock())
        .map_err(|e| format!("cannot reach {}: {e}", paths.shell_sock().display()))?;
    let wait = Some(std::time::Duration::from_secs(30));
    stream.set_read_timeout(wait).map_err(|e| e.to_string())?;
    stream.set_write_timeout(wait).map_err(|e| e.to_string())?;
    Ok(stream)
}

#[cfg(windows)]
fn connect(paths: &Paths) -> Result<impl std::io::Read + Write, String> {
    let name = std::fs::read_to_string(paths.shell_pipe())
        .map_err(|e| format!("cannot read {}: {e}", paths.shell_pipe().display()))?;
    std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(name.trim())
        .map_err(|e| format!("cannot reach the shell pipe: {e}"))
}

pub fn call(paths: &Paths, method: &str, params: Value) -> Result<Value, String> {
    let mut stream = connect(paths)?;
    let request = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
    let mut line = request.to_string();
    line.push('\n');
    stream
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;
    let mut reply = String::new();
    BufReader::new(stream)
        .read_line(&mut reply)
        .map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(reply.trim()).map_err(|e| format!("bad reply: {e}"))?;
    if let Some(error) = value.get("error") {
        return Err(error["message"]
            .as_str()
            .unwrap_or("shell error")
            .to_string());
    }
    Ok(value["result"].clone())
}
