"""
Repro: latale.com event page — interactive UI not displayed in Firefox
Report: https://www.latale.com/event/2026/2q-main1/main

Observed: ~50 <div> children of <main> carry background images but remain
invisible after load — negative Y offsets (-87, -70, -33 …) and/or opacity 0.
The intro animation that should reveal them never fires in Firefox.
Console errors are only unrelated third-party cookie rejections (not the cause).
"""

import asyncio
from firefox_bidi_client import start_session

TARGET_URL = "https://www.latale.com/event/2026/2q-main1/main"

# Checks the visibility state of direct <div> children of <main>.
# Returns counts so the output is informative rather than binary.
# After the intro animation, all content divs should be at opacity 1.
# Any div still at opacity 0 is stuck in its pre-animation state — that is the bug.
VISIBILITY_CHECK = """(() => {
    const main = document.querySelector('main');
    if (!main) return { mainFound: false };

    const divs = Array.from(main.querySelectorAll(':scope > div'));
    const stuck = divs.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.01);

    return {
        mainFound:  true,
        total:      divs.length,
        stuckCount: stuck.length,
        stuckSizes: stuck.map(el => Math.round(el.getBoundingClientRect().height)),
    };
})()"""


async def main():
    async with await start_session() as session:
        page = session.page

        await page.goto(TARGET_URL)

        # Wait for the content container, then let the intro animation window elapse.
        await page.wait_for_selector("main > div")
        await asyncio.sleep(4)

        result = await page.evaluate(VISIBILITY_CHECK)

        if not result.get("mainFound"):
            print("issue not reproduced: <main> element not found")
            return

        total = result["total"]
        stuck = result["stuckCount"]
        sizes = result["stuckSizes"]

        if total == 0:
            print("issue not reproduced: <main> has no <div> children")
        elif stuck > 0:
            print(
                f"issue reproduced: {stuck}/{total} divs stuck at opacity 0 "
                f"after animation window (heights: {sizes})"
            )
            await page.screenshot("repro-latale.png")
            print("  screenshot saved to repro-latale.png")
        else:
            print(f"issue not reproduced: all {total} divs have opacity > 0")


asyncio.run(main())
