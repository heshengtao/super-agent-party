import asyncio
import importlib.util
import json
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock, patch


def _load_web_search():
    for mod_name, attrs in [
        ("langchain_google_community", {"GoogleSearchAPIWrapper": MagicMock()}),
        ("langchain_community", {}),
        ("langchain_community.tools", {"DuckDuckGoSearchResults": MagicMock(), "BraveSearch": MagicMock()}),
        ("langchain_community.utilities", {"GoogleSerperAPIWrapper": MagicMock()}),
        ("langchain_exa", {"ExaSearchResults": MagicMock()}),
        ("crawl4ai", {"AsyncWebCrawler": MagicMock()}),
    ]:
        if mod_name not in sys.modules:
            m = types.ModuleType(mod_name)
            for k, v in attrs.items():
                setattr(m, k, v)
            sys.modules[mod_name] = m
    py_pkg = types.ModuleType("py")
    get_setting = types.ModuleType("py.get_setting")
    load_files = types.ModuleType("py.load_files")
    load_files.check_robots_txt = lambda *a, **k: True

    async def fake_load_settings():
        return {
            "systemSettings": {"proxy": ""},
            "webSearch": {
                "specstream_api_key": "test-key",
                "specstream_max_results": 5,
            },
        }

    get_setting.load_settings = fake_load_settings
    sys.modules["py"] = py_pkg
    sys.modules["py.get_setting"] = get_setting
    sys.modules["py.load_files"] = load_files

    path = Path(__file__).resolve().parent.parent / "py" / "web_search.py"
    spec = importlib.util.spec_from_file_location("py.web_search", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    return mod


def test_specstream_search_and_extract():
    mod = _load_web_search()

    search_resp = MagicMock()
    search_resp.status_code = 200
    search_resp.json.return_value = {
        "sources": [
            {
                "title": "Example",
                "url": "https://example.com",
                "snippet": "Snippet",
                "excerpt": "Excerpt text",
                "source": "example.com",
            }
        ]
    }
    with patch.object(mod.requests, "post", return_value=search_resp) as mock_post:
        raw = asyncio.run(mod.specstream_search("live web data"))
    parsed = json.loads(raw)
    assert len(parsed) == 1
    assert parsed[0]["link"] == "https://example.com"
    assert parsed[0]["snippet"] == "Excerpt text"
    assert mock_post.call_args.kwargs["headers"]["Authorization"] == "Bearer test-key"

    extract_resp = MagicMock()
    extract_resp.status_code = 200
    extract_resp.json.return_value = {
        "results": [
            {"url": "https://example.com", "ok": True, "title": "Example", "text": "Clean body."}
        ]
    }
    with patch.object(mod.requests, "post", return_value=extract_resp) as mock_ext:
        out = asyncio.run(mod.specstream_extract("https://example.com"))
    assert "# Example" in out
    assert "Clean body." in out
    assert mock_ext.call_args.kwargs["json"] == {"urls": ["https://example.com"]}
