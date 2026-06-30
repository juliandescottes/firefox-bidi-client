"""
Webcompat repro pattern: element is invisible or misrendered in Firefox

Use this when you observed: an element that should be visible is missing,
has zero size, or is hidden by CSS (display:none / visibility:hidden / opacity:0).

Adjust TARGET_URL and SELECTOR to the specific page and element you identified.
"""

import asyncio
import json
from firefox_bidi_client import start_session

TARGET_URL = "https://example.com"
SELECTOR = "p"


async def main():
    async with await start_session() as session:
        page = session.page
        await page.goto(TARGET_URL)

        info = await page.evaluate(f"""(() => {{
            const el = document.querySelector({json.dumps(SELECTOR)});
            if (!el) return null;
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {{
                display:    s.display,
                visibility: s.visibility,
                opacity:    s.opacity,
                width:      r.width,
                height:     r.height,
            }};
        }})()""")

        if info is None:
            print("issue reproduced: element not found")
        elif (
            info["display"] == "none"
            or info["visibility"] == "hidden"
            or info["opacity"] == "0"
            or info["width"] == 0
            or info["height"] == 0
        ):
            print(
                f"issue reproduced: element not visible "
                f"(display={info['display']}, visibility={info['visibility']}, "
                f"opacity={info['opacity']}, size={info['width']}x{info['height']})"
            )
        else:
            print("issue not reproduced")


asyncio.run(main())
