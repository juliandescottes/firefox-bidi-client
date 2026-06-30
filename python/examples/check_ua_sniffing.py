"""
Webcompat repro pattern: UA sniffing — site blocks or degrades Firefox

Use this when you observed: a "browser not supported" / "use Chrome" message,
a redirect to a different page, or broken layout that disappeared when you
spoofed the UA to Chrome.

Adjust TARGET_URL and BLOCK_PHRASES to the specific site and wording you saw.
"""

import asyncio
import json
from firefox_bidi_client import start_session

TARGET_URL = "https://example.com"

# Text fragments you observed on the page when Firefox was blocked.
BLOCK_PHRASES = [
    "not supported",
    "use chrome",
    "browser not supported",
]

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


async def find_block_phrase(page) -> str | None:
    text = await page.evaluate("document.body.innerText.toLowerCase()")
    return next((p for p in BLOCK_PHRASES if p in text), None)


async def main():
    async with await start_session() as session:
        page, connection = session.page, session.connection

        # Load with the real Firefox UA
        await page.goto(TARGET_URL)
        blocker = await find_block_phrase(page)

        if not blocker:
            print("issue not reproduced: no UA-blocking message detected")
            return

        print(f'issue reproduced: page shows "{blocker}" with Firefox UA')

        # Confirm by reloading with Chrome UA injected before page load
        await connection.send_command("script.addPreloadScript", {
            "functionDeclaration": (
                f"() => {{ Object.defineProperty(navigator, 'userAgent', "
                f"{{ get: () => {json.dumps(CHROME_UA)}, configurable: true }}); }}"
            ),
        })
        await page.goto(TARGET_URL)
        blocker_after_spoof = await find_block_phrase(page)

        if not blocker_after_spoof:
            print("  confirmed: block disappears with Chrome UA — pure UA sniffing")
        else:
            print("  note: block persists with Chrome UA — may not be UA sniffing alone")


asyncio.run(main())
