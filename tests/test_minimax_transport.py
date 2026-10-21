"""Offline SDK/HTTP checks for the UI-to-chat path, without server startup.

Run with `python tests/test_minimax_transport.py`. The frontend fixture generator
executes the real Vue methods. AST loading avoids desktop/ML startup dependencies;
the SDK and HTTP serialization are real, with a mock transport and dummy key.
"""
import ast
import asyncio
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace

import httpx
from openai import AsyncOpenAI

ROOT = Path(__file__).resolve().parents[1]
TREE = ast.parse((ROOT / "server.py").read_text(encoding="utf-8"))
FIXTURES = json.loads(subprocess.check_output(
    ["node", str(ROOT / "tests/test_minimax_models.js"), "--fixtures"], text=True
))


def load_functions(namespace):
    names = {"get_client_class", "simple_chat_endpoint", "process_extra_params"}
    nodes = [node for node in TREE.body if getattr(node, "name", None) in names]
    assert len(nodes) == len(names)
    for node in nodes:
        node.decorator_list = []
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "server.py", "exec"), namespace)


def load_main_request(namespace):
    # Execute the actual main streaming call, retaining all its SDK keywords.
    function = next(node for node in TREE.body if getattr(node, "name", "") == "generate_stream_response")
    calls = [node for node in ast.walk(function) if isinstance(node, ast.Await)
             and isinstance(node.value, ast.Call)
             and ast.unparse(node.value.func) == "client.chat.completions.create"
             and any(keyword.arg == "stream_options" for keyword in node.value.keywords)]
    assert calls
    wrapper = ast.parse("async def main_request():\n    pass\n").body[0]
    wrapper.body = [ast.Return(value=calls[0])]
    exec(compile(ast.fix_missing_locations(ast.Module(body=[wrapper], type_ignores=[])), "server.py", "exec"), namespace)


async def main():
    captured = []

    def transport(request):
        payload = json.loads(request.content)
        captured.append((str(request.url), payload))
        if payload.get("stream"):
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=b"data: [DONE]\n\n")
        return httpx.Response(200, json={
            "id": "offline", "object": "chat.completion", "created": 0,
            "model": payload["model"], "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "ok"}}]
        })

    messages = [{"role": "user", "content": [
        {"type": "text", "text": "Describe this."},
        {"type": "image_url", "image_url": {"url": "https://example.test/image.png"}},
    ]}]
    tools = [{"type": "function", "function": {"name": "lookup", "parameters": {"type": "object", "properties": {}}}}]
    namespace = {"json": json, "AsyncOpenAI": AsyncOpenAI, "ChatRequest": SimpleNamespace,
                 "JSONResponse": lambda **kwargs: kwargs, "StreamingResponse": lambda *args, **kwargs: args}
    load_functions(namespace)
    load_main_request(namespace)
    async with httpx.AsyncClient(transport=httpx.MockTransport(transport)) as http_client:
        for fixture in FIXTURES:
            provider = {"id": 1, "vendor": fixture["vendor"]}
            settings = {"modelProviders": [provider], "selectedProvider": 1,
                        "model": fixture["model"], "base_url": fixture["url"], "api_key": "offline-test",
                        "temperature": 1, "fast": {}}
            client_class = namespace["get_client_class"](settings, 1)
            assert client_class is AsyncOpenAI
            client = client_class(api_key="offline-test", base_url=fixture["url"], http_client=http_client)

            async def load_settings():
                return dict(settings)

            namespace.update(settings=settings, fast_client=client, load_settings=load_settings)
            for stream in (False, True):
                await namespace["simple_chat_endpoint"](SimpleNamespace(messages=messages, stream=stream, temperature=1))
                url, payload = captured[-1]
                assert url == fixture["url"].rstrip("/") + "/chat/completions"
                assert payload["model"] == fixture["model"]
                assert payload["messages"] == messages
                assert payload["stream"] is stream
                assert all(key not in payload for key in ("thinking", "reasoning_effort", "enable_thinking", "service_tier", "reasoning_split"))

            for effort in (None, "low", "medium", "high", "xhigh", "max"):
                extra = {"max_tokens": 8192, "tools": tools}
                if effort is not None:
                    extra["reasoning_effort"] = effort
                namespace.update(client=client, model=fixture["model"], msg=messages, extra=extra, extra_params={})
                stream = await namespace["main_request"]()
                await stream.close()
                url, payload = captured[-1]
                assert payload["model"] == fixture["model"]
                assert payload["messages"] == messages
                assert payload["tools"] == tools
                assert payload.get("reasoning_effort") == effort
                assert payload["max_tokens"] == 8192
                assert all(key not in payload for key in ("thinking", "enable_thinking", "service_tier", "reasoning_split"))

            # Explicit saved parameters remain pass-through, including legacy values.
            params = [{"name": "thinking", "type": "json", "value": '{"type":"disabled"}'}]
            namespace.update(extra={}, extra_params=namespace["process_extra_params"](params))
            stream = await namespace["main_request"]()
            await stream.close()
            assert captured[-1][1]["thinking"] == {"type": "disabled"}
    print(f"SDK HTTP checks passed: {len(captured)} serialized requests; no live inference.")


if __name__ == "__main__":
    asyncio.run(main())
