import sys


class Logger:
    def log(self, message: str) -> None: ...
    def debug(self, message: str) -> None: ...
    def error(self, message: str, error=None) -> None: ...


class NoOpLogger(Logger):
    def log(self, message: str) -> None: pass
    def debug(self, message: str) -> None: pass
    def error(self, message: str, error=None) -> None: pass


class ConsoleLogger(Logger):
    def __init__(self, debug_enabled: bool = False):
        self._debug_enabled = debug_enabled

    def log(self, message: str) -> None:
        print(message)

    def debug(self, message: str) -> None:
        if self._debug_enabled:
            print(f"[DEBUG] {message}")

    def error(self, message: str, error=None) -> None:
        print(message, error, file=sys.stderr)


_current_logger: Logger = NoOpLogger()


def set_logger(logger: Logger) -> None:
    global _current_logger
    _current_logger = logger


def get_logger() -> Logger:
    return _current_logger


def log(message: str) -> None:
    _current_logger.log(message)


def log_debug(message: str) -> None:
    _current_logger.debug(message)


def log_error(message: str, error=None) -> None:
    _current_logger.error(message, error)
