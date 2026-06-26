import os
from typing import Optional

from .bidi_connection import BiDiConnection
from .bidi_page import BiDiPage
from .logger import ConsoleLogger, set_logger
from .process_manager import FirefoxProcessManager


class Session:
    def __init__(
        self,
        connection: BiDiConnection,
        manager: FirefoxProcessManager,
        initial_context_id: str,
    ):
        self.connection = connection
        self._manager = manager
        self.page = BiDiPage(connection, initial_context_id)

    def get_page(self, context_id: str) -> BiDiPage:
        """Wrap an existing browsing context — use for iframes, child contexts, etc."""
        return BiDiPage(self.connection, context_id)

    async def new_page(self) -> BiDiPage:
        """Open a new top-level browsing context (new tab)."""
        result = await self.connection.send_command("browsingContext.create", {"type": "tab"})
        return BiDiPage(self.connection, result["context"])

    async def close(self) -> None:
        await self.connection.close()
        await self._manager.kill()

    async def __aenter__(self) -> "Session":
        return self

    async def __aexit__(self, *args) -> None:
        await self.close()


async def start_session(
    firefox_path: Optional[str] = None,
    headless: Optional[bool] = None,
    profile_path: Optional[str] = None,
    viewport: Optional[dict] = None,
    args: Optional[list] = None,
    accept_insecure_certs: bool = False,
    env: Optional[dict] = None,
    log_file: Optional[str] = None,
    prefs: Optional[dict] = None,
) -> Session:
    """Launch Firefox with BiDi and return a Session ready for automation.

    Environment variable overrides (when the corresponding kwarg is None):
        FIREFOX_PATH, FIREFOX_PROFILE, FIREFOX_HEADLESS=1, BIDI_DEBUG=1
    """
    if os.environ.get("BIDI_DEBUG") == "1":
        set_logger(ConsoleLogger(debug_enabled=True))

    options = {
        "firefox_path": firefox_path or os.environ.get("FIREFOX_PATH"),
        "headless": headless if headless is not None else (os.environ.get("FIREFOX_HEADLESS") == "1"),
        "profile_path": profile_path or os.environ.get("FIREFOX_PROFILE"),
        "viewport": viewport,
        "args": args,
        "accept_insecure_certs": accept_insecure_certs,
        "env": env,
        "log_file": log_file,
        "prefs": prefs,
    }

    manager = FirefoxProcessManager()
    connection = BiDiConnection()

    port = await manager.launch(options)
    await connection.connect(port)

    always_match: dict = {}
    if accept_insecure_certs:
        always_match["acceptInsecureCerts"] = True
    if prefs:
        always_match["moz:firefoxOptions"] = {"prefs": prefs}

    await connection.send_command("session.new", {"capabilities": {"alwaysMatch": always_match}})

    tree = await connection.send_command("browsingContext.getTree", {})
    initial_context_id = tree["contexts"][0]["context"]

    return Session(connection, manager, initial_context_id)
