const fs = require('fs');
const { firefox } = require('playwright');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

function getRandomUserAgent(filePath) {
  const userAgents = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(ua => ua.trim())
    .filter(ua => ua.length > 0);
  const selectedUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  console.log(`Selected user agent: ${selectedUserAgent}`);
  return selectedUserAgent;
}

const delay = ms => new Promise(res => setTimeout(res, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function spoofDetection(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'PDF Viewer' }
      ]
    });

    window.chrome = { runtime: {}, app: {} };

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      const context = originalGetContext.apply(this, arguments);
      if (type === '2d') {
        const originalGetImageData = context.getImageData;
        context.getImageData = function (x, y, width, height) {
          const imageData = originalGetImageData.apply(this, arguments);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            data[i] += Math.floor(Math.random() * 3) - 1;
            data[i + 1] += Math.floor(Math.random() * 3) - 1;
            data[i + 2] += Math.floor(Math.random() * 3) - 1;
          }
          return imageData;
        };
      }
      return context;
    };

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37446) return 'Intel Inc.';
      if (parameter === 37447) return 'Intel Iris OpenGL Engine';
      return getParameter.apply(this, arguments);
    };
  });
}

async function handleCookieDialog(page) {
  try {
    const selectors = [
      'button:has-text("Accept")',
      'button:has-text("AGREE")',
      'button:has-text("I agree")',
      'text="Accept All"',
      'text="Got it"',
      '[id*="cookie"] button:has-text("Accept")',
      '[class*="cookie"] button:has-text("Accept")',
    ];
    for (const selector of selectors) {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        console.log('Cookie dialog accepted.');
        return true;
      }
    }
    return false;
  } catch (err) {
    console.log('No cookie dialog detected or error during click.');
    return false;
  }
}

async function humanScrollToFooter(page) {
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(randomBetween(500, 1500));

    const footer = await page.$('footer');
    if (!footer) {
      console.log('Footer not found. Skipping scroll.');
      return;
    }

    const boundingBox = await footer.boundingBox();
    const targetY = boundingBox?.y || await page.evaluate(() => document.body.scrollHeight);

    let currentY = 0;
    while (currentY < targetY) {
      const step = randomBetween(300, 600);
      currentY = Math.min(currentY + step, targetY);
      await page.evaluate(y => window.scrollTo(0, y), currentY);
      await delay(randomBetween(30, 80));
      if (Math.random() < 0.1) await delay(randomBetween(150, 400));
    }

    if (Math.random() < 0.5) {
      const backtrack = randomBetween(80, 200);
      await page.evaluate(y => window.scrollTo(0, y), currentY - backtrack);
      await delay(randomBetween(200, 600));
    }

    console.log('Finished human-like scroll to footer.');
  } catch (e) {
    console.log(`Scroll error: ${e.message}`);
  }
}

async function randomlyClickAd(page) {
  const options = ['specificIframeAd', 'highestZIndexIframeAd'];
  const choice = options[Math.floor(Math.random() * options.length)];
  let adClicked = false;

  if (choice === 'specificIframeAd') {
    await page.evaluate(() => window.scrollTo(0, 0));
    const iframes = await page.$$('iframe[allowtransparency="true"][scrolling="no"][frameborder="0"][framespacing="0"][width="468"][height="60"][src="about:blank"]');
    if (iframes.length > 0) {
      const ad = iframes[0];
      await ad.scrollIntoViewIfNeeded();
      const box = await ad.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        console.log('Clicked on 468x60 iframe ad (specific attributes).');
        adClicked = true;
        return adClicked;
      }
    }
    console.log('468x60 iframe ad not found or clickable (specific attributes).');
  } else {
    const iframes = await page.$$('iframe');
    if (iframes.length > 0) {
      let highestZIndex = -1;
      let targetIframe = null;

      for (const iframe of iframes) {
        const style = await iframe.evaluate(el => window.getComputedStyle(el).zIndex);
        const zIndex = style === 'auto' ? 0 : parseInt(style, 10);
        if (zIndex > highestZIndex) {
          highestZIndex = zIndex;
          targetIframe = iframe;
        }
      }

      if (targetIframe) {
        const box = await targetIframe.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          console.log('Clicked on iframe ad.');
          adClicked = true;
          return adClicked;
        }
      }
    }
    console.log('No iframe with valid z-index found.');
  }
  return adClicked;
}

let testedProxies = new Set();
let blacklistedProxies = new Set();
let currentProxy = null;
let proxyUseCount = 0;
let proxyList = [];

async function fetchProxiesFromAPI() {
  console.log("Fetching new proxy batch...");
  const res = await axios.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=3000&country=all&ssl=all&anonymity=elite');
  proxyList = res.data.trim().split('\n').map(p => p.trim()).filter(Boolean);
}

async function getReusableProxy() {
  while (true) {
    if (currentProxy && proxyUseCount < 5) {
      proxyUseCount++;
      console.log(`Reusing proxy [${proxyUseCount}/5]: ${currentProxy}`);
      return currentProxy;
    }

    currentProxy = null;
    proxyUseCount = 0;

    if (proxyList.length === 0) {
      await fetchProxiesFromAPI();
    }

    while (proxyList.length > 0) {
      const proxy = proxyList.shift();
      if (testedProxies.has(proxy) || blacklistedProxies.has(proxy)) continue;

      try {
        await axios.get(
          'https://wixnation.com/wp-content/uploads/2025/02/cropped-IMG-20250126-WA0001-removebg-preview-removebg-preview.png',
          { httpsAgent: new HttpsProxyAgent(`http://${proxy}`), timeout: 5000 }
        );
        currentProxy = proxy;
        proxyUseCount = 1;
        testedProxies.add(proxy);
        console.log(`New valid proxy found: ${proxy}`);
        return proxy;
      } catch {
        testedProxies.add(proxy);
      }
    }

    console.log("All proxies in batch exhausted. Fetching new batch...");
    await fetchProxiesFromAPI();
  }
}

(async function main() {
  while (true) {
    const proxy = await getReusableProxy();
    const userAgent = getRandomUserAgent('user_agents.txt');

    const urls = [
      'https://wixnation.com/blog.html/',
      'https://wixnation.com/blog.html/'
    ];
    const selectedUrl = urls[Math.floor(Math.random() * urls.length)];
    const width = randomBetween(1280, 1440);
    const height = randomBetween(720, 900);

    const context = await firefox.launchPersistentContext('', {
      headless: false,
      proxy: { server: `http://${proxy}` },
      viewport: { width, height },
      userAgent
    });

    const page = await context.newPage();
    await spoofDetection(page);

    try {
      await page.goto(selectedUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
        extraHTTPHeaders: {
          Referer: 'https://www.google.com/'
        }
      });

      console.log(`Opened: ${selectedUrl}`);
      await delay(20000);

      // First attempt to handle cookie dialog
      let cookieDialogHandled = await handleCookieDialog(page);

      // If cookie dialog not found, scroll and try again
      if (!cookieDialogHandled) {
        await humanScrollToFooter(page);
        await handleCookieDialog(page);
      }

      const ad = await page.$('iframe[allowtransparency="true"][scrolling="no"][frameborder="0"][framespacing="0"][width="468"][height="60"][src="about:blank"]');
      if (!ad) {
        console.log('Proxy detected');
        blacklistedProxies.add(currentProxy);
        currentProxy = null;
        proxyUseCount = 0;
        await context.close();
        continue;
      }

      console.log('No proxy');

      // If cookie dialog was handled initially, scroll hasn't happened yet, so do it now
      if (cookieDialogHandled) {
        await humanScrollToFooter(page);
      }

      const adClicked = await randomlyClickAd(page);
      if (adClicked) {
        console.log('Waiting 10 seconds after successful ad click.');
        await delay(10000);
      }

    } catch (e) {
      console.log(`Error: ${e.message}`);
    } finally {
      await context.close();
    }
  }
})();
