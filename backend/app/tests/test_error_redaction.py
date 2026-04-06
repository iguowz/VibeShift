from app.core.errors import _redact


def test_redact_masks_bearer_tokens() -> None:
    text = "Authorization: Bearer abcdefghijklmnop.qrst-UV_1234"
    assert "Bearer ***" in _redact(text)
    assert "abcdefghijklmnop" not in _redact(text)


def test_redact_masks_sk_like_keys_including_proj() -> None:
    text = "api_key=sk-proj-abcdefghijklmnopqrstuvwxyz0123456789"
    redacted = _redact(text)
    assert "api_key=***" in redacted
    assert "sk-proj-" not in redacted


def test_redact_masks_api_key_json_field_without_breaking_shape() -> None:
    text = '{"api_key":"sk-demo-012345678901234567890123","model":"gpt-4o-mini"}'
    redacted = _redact(text)
    assert '"api_key":"***"' in redacted
    assert "sk-demo" not in redacted

