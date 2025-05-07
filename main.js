const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

function getRandomUserAgent(filePath) {
  const userAgents = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(ua => ua.trim())
    .filter(ua => ua.length > 0);
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const delay = ms => new Promise(res => setTimeout(res, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

(async () => {
  const userAgent = getRandomUserAgent('user_agents.txt');
  const chromiumPath = '/home/runner/chromium';

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: chromiumPath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1366,768',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    console.log(`Using User-Agent: ${userAgent}`);

    // Set a realistic viewport size
    await page.setViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
    });

    // Spoof navigator properties to avoid WebDriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin' },
          { name: 'Chrome PDF Viewer' },
          { name: 'Native Client' },
        ],
      });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(window, 'screen', {
        get: () => ({
          width: 1366,
          height: 768,
          availWidth: 1366,
          availHeight: 768,
          colorDepth: 24,
          pixelDepth: 24,
        }),
      });
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37446) return 'Google Inc. (NVIDIA)';
        if (parameter === 37447) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0)';
        return getParameter.apply(this, [parameter]);
      };
    });

    // Patch Chrome-specific objects
    await page.evaluateOnNewDocument(() => {
      window.chrome = {
        runtime: {},
        loadTimes: () => ({}),
        csi: () => ({}),
        app: {},
      };
      Object.defineProperty(window, 'Permissions', {
        get: () => ({
          query: () => Promise.resolve({ state: 'granted' }),
        }),
      });
    });

    // Navigate to Google search
    try {
      await page.goto('https://www.google.com/search?q=wixnation.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log('Waiting 5 seconds...');
      await delay(5000);
    } catch (error) {
      console.error('Failed to load Google search page:', error.message);
      await browser.close();
      return;
    }

    // Find the target link
    const linkHandle = await page.evaluateHandle(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const target = anchors.find(a => {
        const span = a.querySelector('span');
        return span && span.textContent.includes('WiXnation Unlimited Free Music');
      });
      return target || null;
    });

    if (!linkHandle) {
      console.log('Target result not found.');
      await browser.close();
      return;
    }

    const element = linkHandle.asElement();
    if (!element) {
      console.log('Link is not a valid element.');
      await browser.close();
      return;
    }

    const box = await element.boundingBox();
    if (!box) {
      console.log('Bounding box not found.');
      await browser.close();
      return;
    }

    // Simulate human-like mouse interaction
    await page.mouse.move(box.x + 5, box.y + 5, { steps: 15 });
    await delay(randomBetween(300, 800));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await delay(randomBetween(300, 800));
    await element.hover();
    await delay(randomBetween(200, 400));

    // Get the href of the target link
    const href = await page.evaluate(el => el.href, element);
    if (!href) {
      console.log('Link href not found.');
      await browser.close();
      return;
    }

    // Simulate a frontend click with Referer header
    try {
      await page.setExtraHTTPHeaders({ 'Referer': 'https://www.google.com/' });
      await page.evaluate((el) => {
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(clickEvent);
      }, element);
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (error) {
      console.error('Failed to navigate after clicking link:', error.message);
      await browser.close();
      return;
    }

    // Verify GA4 tracking is present
    const ga4Present = await page.evaluate(() => {
      return !!window.gtag || !!document.querySelector('script[src*="gtag/js"]');
    });
    console.log(`GA4 tracking present: ${ga4Present}`);

    const doSearch = Math.random() < 0.5;

    if (!doSearch) {
      const stayTime = randomBetween(30000, 90000);
      console.log(`Staying on page for ${(stayTime / 1000).toFixed(3)}s with random scrolls...`);
      const scrollStart = Date.now();

      while (Date.now() - scrollStart < stayTime) {
        const scrollTo = ['top', 'center', 'footer'][Math.floor(Math.random() * 3)];

        try {
          await page.evaluate(async (scrollTo) => {
            const delay = ms => new Promise(res => setTimeout(res, ms));
            let selector = '';

            switch (scrollTo) {
              case 'top':
                window.scrollTo({ top: 0, behavior: 'smooth' });
                break;
              case 'center':
                selector = 'h2';
                break;
              case 'footer':
                selector = 'footer#colophon.site-footer';
                break;
            }

            if (selector) {
              const el = document.querySelector(selector);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }

            await delay(Math.floor(Math.random() * 2000) + 1500);
          }, scrollTo);
        } catch (error) {
          console.error('Error during scrolling:', error.message);
        }

        await delay(randomBetween(3000, 6000));
      }

      console.log('Scrolling back up...');
      await page.evaluate(() => window.scrollTo(0, 0));
      await delay(randomBetween(3000, 5000));

      const topMenuIds = ['menu-item-1136', 'menu-item-1139', 'menu-item-1143'];
      const footerMenuIds = ['menu-item-1146', 'menu-item-1144', 'menu-item-1147', 'menu-item-1148'];

      const fromTop = Math.random() < 0.5;
      const menuList = fromTop ? topMenuIds : footerMenuIds;
      const chosenId = menuList[Math.floor(Math.random() * menuList.length)];

      console.log(`Attempting to click menu item: ${chosenId}`);

      if (!fromTop) {
        console.log('Scrolling to footer again...');
        await page.evaluate(() => {
          const footer = document.querySelector('footer#colophon.site-footer');
          if (footer) footer.scrollIntoView({ behavior: 'smooth' });
        });
        await delay(randomBetween(3000, 6000));
      }

      const targetEl = await page.$(`#${chosenId}`);
      if (targetEl) {
        const box = await targetEl.boundingBox();
        if (box) {
          await page.mouse.move(box.x, box.y, { steps: randomBetween(10, 25) });
          await delay(randomBetween(300, 800));
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: randomBetween(10, 25) });
          await delay(randomBetween(200, 500));
          await targetEl.hover();
          await delay(randomBetween(200, 600));
          try {
            await Promise.all([
              targetEl.click(),
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
            ]);
            console.log('Menu item clicked.');

            const newStayTime = randomBetween(10000, 60000);
            console.log(`Staying on new page for ${(newStayTime / 1000).toFixed(3)}s with scrolling to footer...`);

            const endTime = Date.now() + newStayTime;
            while (Date.now() < endTime) {
              await page.evaluate(() => {
                const footer = document.querySelector('footer#colophon.site-footer');
                if (footer) {
                  footer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              });
              await delay(randomBetween(3000, 6000));
            }
          } catch (error) {
            console.error('Failed to navigate after clicking menu item:', error.message);
          }
        } else {
          console.log('Element box not found.');
        }
      } else {
        console.log('Menu element not found.');
      }
    } else {
      console.log('Random behavior chosen: Simulating search...');

      const artists = [
        'Beyonce',
        'Taylor Swift',
        'Drake',
        'Billie Eilish',
        'Ed Sheeran',
        'Rihanna',
        'Justin Bieber',
        'Adele',
        'Harry Styles',
      ];

      const keyword = artists[Math.floor(Math.random() * artists.length)];

      const searchBox = await page.$('#search-input');
      if (searchBox) {
        const box = await searchBox.boundingBox();
        if (box) {
          await page.mouse.move(box.x + 5, box.y + 5, { steps: 10 });
          await delay(500);
          await searchBox.click();
          await delay(400);
          await page.keyboard.type(keyword, { delay: randomBetween(100, 200) });
          await page.keyboard.press('Enter');
          console.log(`Typed and searched for: "${keyword}"`);

          try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
          } catch (error) {
            console.log('Navigation after search did not complete, continuing...');
          }
          await delay(randomBetween(3000, 6000));

          await page.evaluate(() => {
            const center = document.querySelector('h2');
            if (center) center.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });

          await delay(randomBetween(2000, 5000));

          const tracks = await page.$$('.spotify-track');
          if (tracks.length > 0) {
            const chosen = tracks[Math.floor(Math.random() * tracks.length)];

            const anchor = await chosen.$('a[href*="open.spotify.com/track"]');
            if (anchor) {
              const box = await anchor.boundingBox();
              if (box) {
                await page.mouse.move(box.x + 10, box.y + 10, { steps: 15 });
                await delay(randomBetween(300, 600));
                await anchor.hover();
                await delay(randomBetween(200, 400));
                await anchor.click();
                console.log('Clicked on Spotify track link.');
              } else {
                console.log('No Spotify <a> link found inside track.');
              }
            } else {
              console.log('No Spotify tracks found.');
            }
          } else {
            console.log('No Spotify tracks found.');
          }
        } else {
          console.log('Search box bounding box not found.');
        }
      } else {
        console.log('Search box not found.');
      }
    }

    console.log('Closing browser...');
    await browser.close();
  } catch (error) {
    console.error('Unexpected error:', error.message);
    if (browser) await browser.close();
  }
})();
