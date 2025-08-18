This folder contains a simple Puppeteer-based smoke test for the calendar UI.

Usage:

1. Start the dev server (example):

   npm run start -- --port 4201

2. Run the smoke test (installs puppeteer if not present):

   # from project root
   npm run smoke

Environment:
- SMOKE_URL can be set to point the test to a different URL (default http://localhost:4201/)

The test will exit with code 0 on success, 2 on failure, and will save a screenshot to tools/smoke/failure.png on failure.
