# Gmail Tracker Chrome Extension

> **ABANDONED** — Pixel tracking does not work for Gmail → Gmail. See below.

---

## Why this project is dead

This extension uses a 1×1 tracking pixel to detect when recipients open emails. The approach is fundamentally broken for Gmail recipients.

**The problem:** Since 2013, Gmail proxies all images through Google's own servers (`mail-attachment.googleusercontent.com`). When a Gmail user receives an email with a tracking pixel:

- Google's proxy pre-fetches the image at **delivery time**, not when the user actually opens the email
- The pixel fires on Google's servers, not the recipient's device
- Every tracked email appears "opened" immediately, regardless of whether it was actually read

This makes open detection impossible to distinguish from Google's automated prefetch. The approach only works when the recipient uses a non-proxying email client (e.g. Outlook desktop, Apple Mail with images enabled) — not Gmail.

## What would actually work

**Link click tracking** is the only reliable alternative for Gmail recipients. Instead of a pixel, you embed a redirect link through your server:

```
https://your-server.com/r/<id>  →  302 redirect to actual URL
```

When the recipient clicks a link, your server logs the click and redirects them. Google cannot pre-fetch link clicks because it doesn't know which links will be clicked. The trade-off is you can only detect clicks, not passive opens.

---

## Original approach (for reference)

1. Extension appended a 1×1 invisible image to outgoing emails, linked to a tracker server
2. When the pixel loaded, the server logged the open with a timestamp
3. The popup showed **📤 Sent** or **👁 Opened** (+ open count)

The server and extension code remain in this repo as a reference for the architecture.
