"""
Webcompat repro pattern: JavaScript errors on page load

Run:
    python check_console_errors.py
    FIREFOX_PATH=/path/to/firefox FIREFOX_HEADLESS=1 python check_console_errors.py
"""

import asyncio
from firefox_bidi_client import start_session

TARGET_URL = "https://example.com"


async def main():
    async with await start_session() as session:
        page, connection = session.page, session.connection

        errors = []
        connection.on_event("log.entryAdded", lambda p: errors.append(p["text"])
                            if p.get("level") == "error" else None)
        await connection.subscribe(["log.entryAdded"])

        await page.goto(TARGET_URL)

        # Wait briefly for async scripts to fire errors
        await asyncio.sleep(1)

        if errors:
            print("issue reproduced")
            for text in errors:
                print(f"  [error] {text}")
        else:
            print("issue not reproduced")


asyncio.run(main())
