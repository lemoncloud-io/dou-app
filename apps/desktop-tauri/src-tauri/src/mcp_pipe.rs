use std::io::{self, BufRead, BufReader, Read, Write};
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::profile::Paths;

const RETRY_EVERY: Duration = Duration::from_millis(250);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub struct Link {
    pub reader: Box<dyn Read + Send>,
    pub writer: Box<dyn Write + Send>,
    pub finish_sending: Box<dyn FnOnce() + Send>,
}

#[cfg(unix)]
fn connect(paths: &Paths, timeout: Option<Duration>) -> io::Result<Link> {
    use std::os::unix::net::UnixStream;
    let stream = UnixStream::connect(paths.mcp_sock())?;
    stream.set_read_timeout(timeout)?;
    let reader = stream.try_clone()?;
    let closer = stream.try_clone()?;
    Ok(Link {
        reader: Box::new(reader),
        writer: Box::new(stream),
        finish_sending: Box::new(move || {
            let _ = closer.shutdown(std::net::Shutdown::Write);
        }),
    })
}

#[cfg(windows)]
fn connect(paths: &Paths, _timeout: Option<Duration>) -> io::Result<Link> {
    let name = std::fs::read_to_string(paths.mcp_pipe())?;
    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(name.trim())?;
    let reader = file.try_clone()?;
    Ok(Link {
        reader: Box::new(reader),
        writer: Box::new(file),
        finish_sending: Box::new(|| {}),
    })
}

pub fn connect_waiting(
    paths: &Paths,
    wait: Duration,
    timeout: Option<Duration>,
) -> Result<Link, String> {
    let deadline = Instant::now() + wait;
    loop {
        match connect(paths, timeout) {
            Ok(link) => return Ok(link),
            Err(error) if Instant::now() >= deadline => {
                return Err(format!(
                    "cannot reach the DoU MCP server of {}: {error}. Start DoU Desktop with this profile first.",
                    paths.root().display()
                ));
            }
            Err(_) => std::thread::sleep(RETRY_EVERY),
        }
    }
}

pub fn pump(reader: &mut impl Read, writer: &mut impl Write) -> io::Result<u64> {
    let mut buffer = [0u8; 8192];
    let mut total = 0u64;
    loop {
        let read = match reader.read(&mut buffer) {
            Ok(0) => return Ok(total),
            Ok(read) => read,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        writer.write_all(&buffer[..read])?;
        writer.flush()?;
        total += read as u64;
    }
}

pub fn bridge(
    paths: &Paths,
    wait: Duration,
    input: impl Read + Send + 'static,
    mut output: impl Write,
) -> Result<(), String> {
    let Link {
        mut reader,
        mut writer,
        finish_sending,
    } = connect_waiting(paths, wait, None)?;
    std::thread::spawn(move || {
        let mut input = input;
        let _ = pump(&mut input, &mut writer);
        finish_sending();
    });
    pump(&mut reader, &mut output).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn request(paths: &Paths, method: &str, params: Value) -> Result<Value, String> {
    let Link {
        reader, mut writer, ..
    } = connect_waiting(paths, Duration::ZERO, Some(REQUEST_TIMEOUT))?;
    let mut line =
        json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params }).to_string();
    line.push('\n');
    writer
        .write_all(line.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    let mut reply = String::new();
    BufReader::new(reader)
        .read_line(&mut reply)
        .map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(reply.trim()).map_err(|e| format!("bad reply: {e}"))?;
    if let Some(error) = value.get("error") {
        return Err(error["message"].as_str().unwrap_or("MCP error").to_string());
    }
    Ok(value["result"].clone())
}

pub fn call_tool(paths: &Paths, name: &str, arguments: Value) -> Result<Value, String> {
    let result = request(
        paths,
        "tools/call",
        json!({ "name": name, "arguments": arguments }),
    )?;
    let text = result["content"][0]["text"].as_str().unwrap_or("null");
    let body: Value = serde_json::from_str(text).map_err(|e| format!("bad tool reply: {e}"))?;
    if result["isError"] == true {
        return Err(body["message"].as_str().unwrap_or("tool error").to_string());
    }
    Ok(body)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::os::unix::net::UnixListener;

    fn serve_once(paths: &Paths, answer: &'static str) -> std::thread::JoinHandle<String> {
        let listener = UnixListener::bind(paths.mcp_sock()).expect("bind");
        std::thread::spawn(move || {
            let (stream, _) = listener.accept().expect("accept");
            let mut reader = BufReader::new(stream.try_clone().expect("clone"));
            let mut line = String::new();
            reader.read_line(&mut line).expect("read");
            let mut stream = stream;
            stream.write_all(answer.as_bytes()).expect("write");
            line
        })
    }

    fn profile() -> (tempfile::TempDir, Paths) {
        let dir = tempfile::tempdir().expect("temp dir");
        let paths = Paths::new(dir.path());
        (dir, paths)
    }

    struct Shared(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);

    impl Write for Shared {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.0.lock().expect("lock").extend_from_slice(data);
            Ok(data.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn the_bridge_copies_bytes_both_ways_and_ends_with_the_server() {
        let (_dir, paths) = profile();
        let server = serve_once(&paths, "{\"id\":1}\n");
        let out = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        bridge(
            &paths,
            Duration::from_secs(2),
            Cursor::new(b"{\"method\":\"ping\"}\n".to_vec()),
            Shared(out.clone()),
        )
        .expect("bridge");
        assert_eq!(server.join().expect("server"), "{\"method\":\"ping\"}\n");
        assert_eq!(out.lock().expect("lock").as_slice(), b"{\"id\":1}\n");
    }

    #[test]
    fn a_missing_socket_is_reported_in_one_line_after_the_wait() {
        let (_dir, paths) = profile();
        let error = bridge(
            &paths,
            Duration::from_millis(300),
            Cursor::new(Vec::new()),
            Vec::new(),
        )
        .expect_err("no server");
        assert!(error.contains("cannot reach the DoU MCP server"), "{error}");
        assert!(!error.contains('\n'));
    }

    #[test]
    fn a_request_returns_the_result_and_a_tool_call_unwraps_the_text() {
        let (_dir, paths) = profile();
        let server = serve_once(
            &paths,
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"signedIn\":true}}\n",
        );
        let result = request(&paths, "dou/status", json!({})).expect("request");
        assert_eq!(result["signedIn"], true);
        assert!(server.join().expect("server").contains("dou/status"));
    }

    #[test]
    fn a_tool_error_becomes_an_error_with_its_message() {
        let (_dir, paths) = profile();
        let reply = "{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"isError\":true,\"content\":[{\"type\":\"text\",\"text\":\"{\\\"code\\\":\\\"tier_off\\\",\\\"message\\\":\\\"Agent access is off.\\\"}\"}]}}\n";
        let server = serve_once(&paths, reply);
        let error = call_tool(&paths, "rooms_list", json!({})).expect_err("tier off");
        assert_eq!(error, "Agent access is off.");
        server.join().expect("server");
    }
}
