import asyncio
import base64
import json
from pathlib import Path
from typing import Any, Optional

from .bidi_connection import BiDiConnection
from .logger import log_debug


def _unwrap_remote_value(remote: Any) -> Any:
    if not remote or not isinstance(remote, dict):
        return remote
    t = remote.get("type")
    if t in ("string", "number", "boolean"):
        return remote.get("value")
    if t in ("null", "undefined"):
        return None
    if t == "array":
        return [_unwrap_remote_value(v) for v in (remote.get("value") or [])]
    if t == "object":
        val = remote.get("value")
        if isinstance(val, list):
            return {_unwrap_remote_value(k): _unwrap_remote_value(v) for k, v in val}
        return val
    return remote


def _serialize_local_value(value: Any) -> Any:
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "boolean", "value": value}
    if isinstance(value, (int, float)):
        return {"type": "number", "value": value}
    if isinstance(value, str):
        return {"type": "string", "value": value}
    if isinstance(value, list):
        return {"type": "array", "value": [_serialize_local_value(v) for v in value]}
    if isinstance(value, dict):
        return {
            "type": "object",
            "value": [
                [{"type": "string", "value": k}, _serialize_local_value(v)]
                for k, v in value.items()
            ],
        }
    raise TypeError(f"Cannot serialize {type(value).__name__} to BiDi LocalValue")


class BiDiPage:
    def __init__(self, connection: BiDiConnection, context_id: str):
        self._connection = connection
        self._context_id = context_id

    @property
    def id(self) -> str:
        return self._context_id

    # ── Navigation ──────────────────────────────────────────────────────────────

    async def goto(self, url: str, wait: str = "complete") -> None:
        await self._connection.send_command("browsingContext.navigate", {
            "context": self._context_id,
            "url": url,
            "wait": wait,
        })
        log_debug(f"Navigated to {url}")

    async def navigate(self, url: str, wait: str = "complete") -> None:
        return await self.goto(url, wait)

    # ── Script evaluation ────────────────────────────────────────────────────────

    async def evaluate(self, expression: str, arg: Any = None) -> Any:
        """
        Evaluate a JS expression or function declaration string in the page context.

            await page.evaluate('document.title')
            await page.evaluate('(x) => x * 2', 21)
            await page.evaluate('() => document.querySelectorAll("a").length')
        """
        stripped = expression.strip()
        is_function = "=>" in stripped or stripped.startswith("function")

        if is_function:
            result = await self._connection.send_command("script.callFunction", {
                "functionDeclaration": expression,
                "target": {"context": self._context_id},
                "awaitPromise": True,
                "arguments": [_serialize_local_value(arg)] if arg is not None else [],
            })
        else:
            result = await self._connection.send_command("script.evaluate", {
                "expression": expression,
                "target": {"context": self._context_id},
                "awaitPromise": True,
            })

        if result.get("type") == "exception":
            raise RuntimeError(
                result.get("exceptionDetails", {}).get("text", "Script exception")
            )
        return _unwrap_remote_value(result.get("result"))

    # ── Interaction ──────────────────────────────────────────────────────────────

    async def perform_actions(self, actions: list) -> None:
        """Send one or more BiDi input source actions and release when done.
        Accepts the raw actions array from the input.performActions spec."""
        await self._connection.send_command("input.performActions", {
            "context": self._context_id,
            "actions": actions,
        })
        await self._connection.send_command("input.releaseActions", {"context": self._context_id})

    async def click(self, selector: str) -> None:
        located = await self._connection.send_command("browsingContext.locateNodes", {
            "context": self._context_id,
            "locator": {"type": "css", "value": selector},
            "maxNodeCount": 1,
        })
        nodes = located.get("nodes", [])
        if not nodes:
            raise RuntimeError(f"Element not found: {selector}")

        element = nodes[0]
        # x/y 0,0 = element center; BiDi scrolls the element into view automatically
        await self.perform_actions([{
            "type": "pointer",
            "id": "mouse1",
            "actions": [
                {
                    "type": "pointerMove",
                    "x": 0,
                    "y": 0,
                    "origin": {"type": "element", "element": {"sharedId": element["sharedId"]}},
                },
                {"type": "pointerDown", "button": 0},
                {"type": "pointerUp", "button": 0},
            ],
        }])
        log_debug(f'Clicked "{selector}"')

    async def type(self, selector: str, text: str) -> None:
        """Click a selector to focus it, then dispatch key down/up pairs for each character.
        For special keys use their Unicode code point (e.g. '\\uE007' for Enter)."""
        await self.click(selector)
        await self.perform_actions([{
            "type": "key",
            "id": "keyboard",
            "actions": [
                action
                for char in text
                for action in (
                    {"type": "keyDown", "value": char},
                    {"type": "keyUp", "value": char},
                )
            ],
        }])
        log_debug(f'Typed {len(text)} characters into "{selector}"')

    # ── Waiting ──────────────────────────────────────────────────────────────────

    async def wait_for_function(
        self,
        expression: str,
        timeout: float = 5.0,
        interval: float = 0.1,
    ) -> None:
        """Poll until the JS expression returns truthy, or timeout (seconds)."""
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline:
            try:
                if await self.evaluate(expression):
                    return
            except Exception:
                pass
            await asyncio.sleep(interval)
        raise TimeoutError(f"wait_for_function timed out after {timeout}s")

    async def wait_for_selector(self, selector: str, timeout: float = 5.0) -> None:
        return await self.wait_for_function(
            f"document.querySelector({json.dumps(selector)}) !== null",
            timeout=timeout,
        )

    async def wait_for(
        self,
        expression: str,
        timeout: float = 5.0,
        interval: float = 0.1,
    ) -> None:
        return await self.wait_for_function(expression, timeout=timeout, interval=interval)

    # ── Page info ────────────────────────────────────────────────────────────────

    async def title(self) -> str:
        return await self.evaluate("document.title")

    async def url(self) -> str:
        return await self.evaluate("location.href")

    # ── Screenshot ───────────────────────────────────────────────────────────────

    async def screenshot(self, path: Optional[str] = None) -> bytes:
        result = await self._connection.send_command("browsingContext.captureScreenshot", {
            "context": self._context_id,
        })
        data = base64.b64decode(result["data"])
        if path:
            Path(path).write_bytes(data)
            log_debug(f'Screenshot saved to "{path}"')
        return data
