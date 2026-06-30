"""
Webcompat repro pattern: form or button interaction fails in Firefox

Use this when you observed: filling a form and clicking submit produced no result,
an error, or a wrong outcome — while the same steps worked in another browser.

Adjust the URL, selectors, input value, and success condition to what you observed.
"""

import asyncio
import json
from firefox_bidi_client import start_session

TARGET_URL = "https://example.com"
INPUT_SELECTOR = 'input[type="text"]'
SUBMIT_SELECTOR = 'button[type="submit"]'
SUCCESS_SELECTOR = ".result"


async def main():
    async with await start_session() as session:
        page = session.page
        await page.goto(TARGET_URL)

        # Fill the input field
        await page.evaluate(
            "([sel, val]) => {"
            "  const el = document.querySelector(sel);"
            "  el.focus();"
            "  el.value = val;"
            "  el.dispatchEvent(new Event('input', { bubbles: true }));"
            "  el.dispatchEvent(new Event('change', { bubbles: true }));"
            "}",
            [INPUT_SELECTOR, "test value"],
        )

        await page.click(SUBMIT_SELECTOR)

        try:
            await page.wait_for_selector(SUCCESS_SELECTOR, timeout=5.0)
            print("issue not reproduced")
        except TimeoutError:
            url = await page.url()
            print(f"issue reproduced: expected result element not found after interaction (url: {url})")
            await page.screenshot("repro-screenshot.png")
            print("  screenshot saved to repro-screenshot.png")


asyncio.run(main())
