import asyncio
import json
from typing import Any, Callable, Dict, Optional, Set

import websockets

from .logger import log, log_debug


class BiDiConnection:
    def __init__(self, connection_timeout: float = 5.0, command_timeout: float = 10.0):
        self._ws = None
        self._next_id: int = 1
        self._pending: Dict[int, asyncio.Future] = {}
        self._pending_methods: Dict[int, str] = {}
        self._event_handlers: Set[Callable] = set()
        self._named_event_handlers: Dict[str, Set[Callable]] = {}
        self._connected: bool = False
        self._connection_timeout = connection_timeout
        self._command_timeout = command_timeout
        self._receive_task: Optional[asyncio.Task] = None

    async def connect(self, port: int) -> None:
        log_debug(f"Attempting to connect to BiDi on port {port}")
        endpoints = [
            f"ws://127.0.0.1:{port}",
            f"ws://127.0.0.1:{port}/session",
        ]
        last_error: Optional[Exception] = None
        for endpoint in endpoints:
            try:
                await self._connect_to_endpoint(endpoint)
                log(f"Connected to Firefox BiDi at {endpoint}")
                self._connected = True
                return
            except Exception as e:
                last_error = e
                log_debug(f"Failed to connect to {endpoint}: {e}")

        raise ConnectionError(
            f"Failed to connect to Firefox on port {port}.\n"
            f"Last error: {last_error}"
        )

    async def _connect_to_endpoint(self, endpoint: str) -> None:
        ws = await asyncio.wait_for(
            websockets.connect(endpoint),
            timeout=self._connection_timeout,
        )
        self._ws = ws
        self._receive_task = asyncio.create_task(self._receive_loop())

    async def _receive_loop(self) -> None:
        try:
            async for message in self._ws:
                try:
                    self._handle_message(json.loads(message))
                except Exception as e:
                    log_debug(f"Failed to parse BiDi message: {e}")
        except Exception as e:
            log_debug(f"BiDi receive loop ended: {e}")
        finally:
            self._connected = False
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(ConnectionError("WebSocket closed"))
            self._pending.clear()

    def _handle_message(self, message: Any) -> None:
        if message.get("id") is not None:
            msg_id = message["id"]
            fut = self._pending.pop(msg_id, None)
            method = self._pending_methods.pop(msg_id, "unknown")
            if fut and not fut.done():
                if "error" in message:
                    fut.set_exception(
                        RuntimeError(f"BiDi error in {method}: {json.dumps(message['error'])}")
                    )
                else:
                    fut.set_result(message.get("result", {}))
            return

        if "method" in message:
            log_debug(f"BiDi event: {message['method']}")
            for handler in list(self._event_handlers):
                try:
                    handler(message)
                except Exception as e:
                    log_debug(f"Error in event handler: {e}")
            named = self._named_event_handlers.get(message["method"])
            if named:
                for handler in list(named):
                    try:
                        handler(message.get("params", {}))
                    except Exception as e:
                        log_debug(f"Error in named event handler for {message['method']}: {e}")

    async def send_command(self, method: str, params: Any = None) -> Any:
        if self._ws is None:
            raise ConnectionError("Not connected to Firefox BiDi")

        if params is None:
            params = {}

        cmd_id = self._next_id
        self._next_id += 1

        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[cmd_id] = fut
        self._pending_methods[cmd_id] = method

        log_debug(f"→ BiDi command: {method}")
        await self._ws.send(json.dumps({"id": cmd_id, "method": method, "params": params}))

        try:
            return await asyncio.wait_for(asyncio.shield(fut), timeout=self._command_timeout)
        except asyncio.TimeoutError:
            self._pending.pop(cmd_id, None)
            self._pending_methods.pop(cmd_id, None)
            raise TimeoutError(f"BiDi command timeout: {method}")

    async def subscribe(self, events: list, contexts: Optional[list] = None) -> None:
        params: dict = {"events": events}
        if contexts:
            params["contexts"] = contexts
        await self.send_command("session.subscribe", params)
        log_debug(f"Subscribed to events: {', '.join(events)}")

    def on_event(self, method: str, handler: Callable) -> None:
        """Register a handler for a specific BiDi event (e.g. 'log.entryAdded').
        The handler receives event.params directly. Call subscribe() first."""
        if method not in self._named_event_handlers:
            self._named_event_handlers[method] = set()
        self._named_event_handlers[method].add(handler)

    def off_event(self, method: str, handler: Callable) -> None:
        if method in self._named_event_handlers:
            self._named_event_handlers[method].discard(handler)

    def on(self, handler: Callable) -> None:
        """Register a handler for all raw BiDi messages."""
        self._event_handlers.add(handler)

    def off(self, handler: Callable) -> None:
        self._event_handlers.discard(handler)

    def is_connected(self) -> bool:
        return self._connected and self._ws is not None

    async def close(self) -> None:
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

        if self._ws:
            log_debug("Closing BiDi WebSocket connection")
            for fut in self._pending.values():
                if not fut.done():
                    fut.set_exception(ConnectionError("Connection closing"))
            self._pending.clear()
            self._event_handlers.clear()
            self._named_event_handlers.clear()
            await self._ws.close()
            self._ws = None
            self._connected = False
