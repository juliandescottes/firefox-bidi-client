"""
Webcompat repro pattern: network request failures (CORS, 4xx, 5xx, fetch errors)

Use this when you observed: a failed fetch in DevTools, a CORS error in the
console, missing content that should have loaded from an API, or a red request
in the network panel.

Adjust TARGET_URL and optionally FILTER_URL to narrow to the specific endpoint.
"""

import asyncio
from firefox_bidi_client import start_session

TARGET_URL = "https://example.com"

# Optional: only report failures for URLs containing this string.
# Set to "" to report all failures.
FILTER_URL = ""


async def main():
    async with await start_session() as session:
        page, connection = session.page, session.connection

        failures = []

        def on_fetch_error(params):
            url = params["request"]["url"]
            if not FILTER_URL or FILTER_URL in url:
                failures.append({"type": "fetchError", "url": url, "error": params.get("errorText", "")})

        def on_response_completed(params):
            url = params["request"]["url"]
            status = params["response"]["status"]
            if status >= 400 and (not FILTER_URL or FILTER_URL in url):
                failures.append({"type": "httpError", "url": url, "status": status})

        connection.on_event("network.fetchError", on_fetch_error)
        connection.on_event("network.responseCompleted", on_response_completed)

        # Subscribe before navigating so no events are missed
        await connection.subscribe(["network.fetchError", "network.responseCompleted"])

        await page.goto(TARGET_URL)

        # Allow async requests triggered after load to complete
        await asyncio.sleep(2)

        if failures:
            print("issue reproduced:")
            for f in failures:
                if f["type"] == "fetchError":
                    print(f"  [fetch error] {f['url']} — {f['error']}")
                elif f["type"] == "httpError":
                    print(f"  [{f['status']}] {f['url']}")
        else:
            print("issue not reproduced")


asyncio.run(main())
