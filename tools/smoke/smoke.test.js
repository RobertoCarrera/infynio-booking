const puppeteer = require('puppeteer');

// Simple smoke test that starts a headless browser, navigates to the dev server
// and asserts that the calendar and the left offcanvas exist and that the calendar
// element has non-zero clientHeight/Width (i.e. it's rendered and sized).

(async () => {
  const base = process.env.SMOKE_URL || 'http://localhost:4201/';
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  try {
    console.log('Navigating to', base);
    await page.goto(base, { waitUntil: 'networkidle2' });
    // wait for calendar component
    await page.waitForSelector('app-calendar', { timeout: 10000 });
    // query the full-calendar element
    const calHandle = await page.$('full-calendar');
    if (!calHandle) throw new Error('full-calendar not found');
    const size = await page.evaluate(el => ({ w: el.clientWidth, h: el.clientHeight }), calHandle);
    console.log('full-calendar size:', size);
    if (!size.w || !size.h) throw new Error('Calendar has zero size');

    // open filters via toolbar button (assumes there's a button with data-testid="toggle-filters")
    const toggle = await page.$('[data-testid="toggle-filters"]');
    if (toggle) {
      await toggle.click();
      // wait a bit for animation
      await page.waitForTimeout(420);
      // check offcanvas presence
      const off = await page.$('aside.class-filters.offcanvas');
      if (!off) throw new Error('offcanvas filters not found');
      const ov = await page.evaluate(el => ({ scrollW: el.scrollWidth, clientW: el.clientWidth }), off);
      console.log('offcanvas size:', ov);
    } else {
      console.log('toggle button not found, skipping open-check');
    }

    console.log('SMOKE: PASS');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('SMOKE: FAIL', err && err.message ? err.message : err);
    await browser.screenshot({ path: 'tools/smoke/failure.png' }).catch(()=>{});
    await browser.close();
    process.exit(2);
  }
})();
