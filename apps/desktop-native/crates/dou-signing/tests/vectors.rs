use dou_signing::{SignatureContext, SignaturePayload, sign};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Vector {
    name: String,
    auth_id: String,
    account_id: String,
    identity_id: String,
    current: String,
    user_agent: String,
    signature: String,
}

#[derive(Deserialize)]
struct VectorFile {
    vectors: Vec<Vector>,
}

#[test]
fn signing_vectors_match_the_ts_signer_byte_for_byte() {
    let file: VectorFile =
        serde_json::from_str(include_str!("../../../vectors/signing.json")).unwrap();
    assert!(file.vectors.len() >= 12);
    for v in file.vectors {
        let payload = SignaturePayload {
            auth_id: v.auth_id,
            account_id: v.account_id,
            identity_id: v.identity_id,
        };
        let context = SignatureContext {
            current: v.current.clone(),
            user_agent: v.user_agent,
        };
        let signed = sign(&payload, &context).unwrap();
        assert_eq!(signed.signature, v.signature, "vector {}", v.name);
        assert_eq!(signed.current, v.current, "vector {}", v.name);
    }
}

#[test]
fn relay_literal_pinned_by_the_ts_test_is_reproduced() {
    let payload = SignaturePayload {
        auth_id: "auth-relay-id".into(),
        account_id: "account-relay-1".into(),
        identity_id: "identity-relay-1".into(),
    };
    let context = SignatureContext {
        current: "2026-08-27T00:00:00.000Z".into(),
        user_agent: "fixture-ua/1.0".into(),
    };
    assert_eq!(
        sign(&payload, &context).unwrap().signature,
        "lfOFYzXFM4hYKhCfPuDb/0INNosD42VRotuv4VvcTBs="
    );
}
