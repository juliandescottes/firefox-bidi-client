import asyncio
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import IO, Optional

from .logger import log, log_debug


class FirefoxProcessManager:
    def __init__(self):
        self._process: Optional[asyncio.subprocess.Process] = None
        self._debugging_port: int = 0
        self._profile_path: Optional[Path] = None
        self._is_temp_profile: bool = False
        self._log_file: Optional[IO[bytes]] = None
        self._stdout_task: Optional[asyncio.Task] = None
        self._stderr_task: Optional[asyncio.Task] = None

    async def launch(self, options: dict) -> int:
        log("Launching Firefox with BiDi...")

        firefox_binary = options.get("firefox_path") or self._get_default_firefox_path()
        args = self._build_firefox_args(options)

        log_debug(f"Firefox binary: {firefox_binary}")
        log_debug(f"Firefox args: {' '.join(args)}")

        env = None
        if options.get("env"):
            env = {**os.environ, **options["env"]}

        if options.get("log_file"):
            self._log_file = open(options["log_file"], "ab")

        self._process = await asyncio.create_subprocess_exec(
            firefox_binary,
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        self._debugging_port = await self._wait_for_bidi_port()
        log(f"Firefox launched (BiDi port: {self._debugging_port})")
        return self._debugging_port

    def _build_firefox_args(self, options: dict) -> list:
        args = ["--no-remote", "--remote-debugging-port=0"]

        if options.get("headless"):
            args.append("--headless")

        if options.get("viewport"):
            vp = options["viewport"]
            args += [f"--width={vp['width']}", f"--height={vp['height']}"]

        if options.get("profile_path"):
            self._profile_path = Path(options["profile_path"])
            self._is_temp_profile = False
        else:
            self._profile_path = Path(tempfile.mkdtemp(prefix="firefox-profile-"))
            self._is_temp_profile = True

        args += ["--profile", str(self._profile_path)]

        if options.get("args"):
            args += options["args"]

        return args

    def _get_default_firefox_path(self) -> str:
        if sys.platform == "darwin":
            return "/Applications/Firefox.app/Contents/MacOS/firefox"
        if sys.platform == "win32":
            return r"C:\Program Files\Mozilla Firefox\firefox.exe"
        return "firefox"

    async def _wait_for_bidi_port(self) -> int:
        pattern = re.compile(
            r"WebDriver BiDi listening on ws://127\.0\.0\.1:(\d+)", re.IGNORECASE
        )
        port_future: asyncio.Future = asyncio.get_event_loop().create_future()

        async def drain(stream, label: str) -> None:
            async for line in stream:
                text = line.decode("utf-8", errors="replace")
                if self._log_file:
                    self._log_file.write(line)
                log_debug(f"Firefox {label}: {text.rstrip()}")
                if not port_future.done():
                    m = pattern.search(text)
                    if m:
                        port_future.set_result(int(m.group(1)))

        self._stdout_task = asyncio.create_task(drain(self._process.stdout, "stdout"))
        self._stderr_task = asyncio.create_task(drain(self._process.stderr, "stderr"))

        try:
            return await asyncio.wait_for(asyncio.shield(port_future), timeout=10.0)
        except asyncio.TimeoutError:
            raise TimeoutError("Timeout waiting for Firefox BiDi port (10 seconds)")

    async def kill(self) -> None:
        for task in (self._stdout_task, self._stderr_task):
            if task:
                task.cancel()
        self._stdout_task = None
        self._stderr_task = None

        if self._log_file:
            self._log_file.close()
            self._log_file = None

        if self._process and self._process.returncode is None:
            log_debug("Killing Firefox process")
            try:
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                log_debug("Force killing Firefox process")
                self._process.kill()
                await self._process.wait()

        self._process = None

        if self._is_temp_profile and self._profile_path:
            try:
                shutil.rmtree(self._profile_path, ignore_errors=True)
                log_debug(f"Cleaned up temporary profile: {self._profile_path}")
            except Exception as e:
                log_debug(f"Error cleaning up temporary profile: {e}")
            self._profile_path = None
            self._is_temp_profile = False

        self._debugging_port = 0

    def is_running(self) -> bool:
        return self._process is not None and self._process.returncode is None

    def get_port(self) -> int:
        return self._debugging_port
