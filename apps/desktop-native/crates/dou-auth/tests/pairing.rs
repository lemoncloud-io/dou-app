use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use dou_auth::{Endpoints, PairingPhase, PairingRequest, RelayApi, TokenView};
use dou_http::HttpClient;

fn fake_relay(claims: Vec<&'static str>) -> (String, Arc<Mutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&seen);
    std::thread::spawn(move || {
        let mut claims = claims.into_iter();
        while let Ok((mut stream, _)) = listener.accept() {
            let mut buffer = vec![0u8; 8192];
            let read = stream.read(&mut buffer).unwrap_or(0);
            let head = String::from_utf8_lossy(&buffer[..read]).to_string();
            let first = head.lines().next().unwrap_or("").to_string();
            log.lock().unwrap().push(head.clone());
            let body = if first.contains("/pairings/0/request") {
                r#"{"pairingId":"p1","code":"12345678","expiredAt":9999999999999,"interval":1}"#
                    .to_string()
            } else if first.contains("/pairings/p1/claim") {
                claims
                    .next()
                    .unwrap_or(r#"{"status":"pending"}"#)
                    .to_string()
            } else {
                "{}".to_string()
            };
            let reply = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = stream.write_all(reply.as_bytes());
        }
    });
    (base, seen)
}

fn device_session() -> TokenView {
    serde_json::from_str(
        r#"{"id":"dev","Token":{"identityToken":"jwt","credential":{"AccessKeyId":"k","SecretKey":"s","SessionToken":"t"}}}"#,
    )
    .unwrap()
}

#[tokio::test]
async fn polls_claim_until_approved_and_returns_the_approvers_session() {
    let approved = r#"{"status":"approved","session":{"id":"1000050","Token":{"identityToken":"approver-jwt"}}}"#;
    let (base, seen) = fake_relay(vec![r#"{"status":"pending"}"#, approved]);
    let api = RelayApi::new(
        HttpClient::new("test/1").unwrap(),
        Endpoints::new(&base, "wss://x"),
    );
    let device = device_session();
    let request = PairingRequest::start(&api, &device, "device-1")
        .await
        .unwrap();
    assert_eq!(request.view.code, "12345678");

    let phases = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&phases);
    let session = request
        .wait(
            &api,
            &device,
            move |p| sink.lock().unwrap().push(p),
            Duration::from_millis(5),
        )
        .await
        .unwrap();

    assert_eq!(session.user_id(), Some("1000050"));
    assert_eq!(
        *phases.lock().unwrap(),
        vec![
            PairingPhase::Waiting {
                code: "12345678".into()
            },
            PairingPhase::Applying
        ]
    );
    let requests = seen.lock().unwrap();
    assert!(
        requests
            .iter()
            .all(|r| r.to_lowercase().contains("authorization: aws4-hmac-sha256"))
    );
    assert!(
        requests
            .iter()
            .all(|r| r.to_lowercase().contains("x-lemon-identity: jwt"))
    );
}

#[tokio::test]
async fn a_cloud_approval_without_a_session_asks_for_the_whole_account() {
    let cloud = r#"{"status":"approved","target":{"type":"cloud","cloudId":"c1"},"approver":{}}"#;
    let (base, _) = fake_relay(vec![cloud]);
    let api = RelayApi::new(
        HttpClient::new("test/1").unwrap(),
        Endpoints::new(&base, "wss://x"),
    );
    let device = device_session();
    let request = PairingRequest::start(&api, &device, "device-1")
        .await
        .unwrap();
    let error = request
        .wait(&api, &device, |_| {}, Duration::from_millis(5))
        .await
        .unwrap_err();
    assert_eq!(error, dou_core::Error::PairingNeedsAccount);
    assert!(error.to_string().contains("Approve my whole account"));
}

#[tokio::test]
async fn a_denied_pairing_ends_the_wait() {
    let (base, _) = fake_relay(vec![r#"{"status":"denied"}"#]);
    let api = RelayApi::new(
        HttpClient::new("test/1").unwrap(),
        Endpoints::new(&base, "wss://x"),
    );
    let device = device_session();
    let request = PairingRequest::start(&api, &device, "device-1")
        .await
        .unwrap();
    let error = request
        .wait(&api, &device, |_| {}, Duration::from_millis(5))
        .await
        .unwrap_err();
    assert_eq!(error.to_string(), "pairing ended: denied");
}
