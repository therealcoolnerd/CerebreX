"""Tests for auth helpers."""

from __future__ import annotations

import pytest

from cerebrex.auth import get_api_key, get_kairos_url, get_memex_url, get_registry_url


def test_get_api_key_from_arg() -> None:
    assert get_api_key("cx-explicit") == "cx-explicit"


def test_get_api_key_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CEREBREX_API_KEY", "cx-from-env")
    assert get_api_key() == "cx-from-env"


def test_get_api_key_arg_takes_precedence(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CEREBREX_API_KEY", "cx-from-env")
    assert get_api_key("cx-explicit") == "cx-explicit"


def test_get_api_key_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CEREBREX_API_KEY", raising=False)
    with pytest.raises(ValueError, match="No CerebreX API key"):
        get_api_key()


def test_get_memex_url_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CEREBREX_MEMEX_URL", raising=False)
    url = get_memex_url()
    assert url.startswith("https://")
    assert not url.endswith("/")


def test_get_memex_url_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CEREBREX_MEMEX_URL", "https://my-memex.dev")
    assert get_memex_url() == "https://my-memex.dev"


def test_get_memex_url_strips_trailing_slash() -> None:
    assert get_memex_url("https://example.com/") == "https://example.com"


def test_get_kairos_url_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CEREBREX_KAIROS_URL", raising=False)
    url = get_kairos_url()
    assert url.startswith("https://")


def test_get_registry_url_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CEREBREX_REGISTRY_URL", raising=False)
    url = get_registry_url()
    assert "therealcool.site" in url or "cerebrex" in url
