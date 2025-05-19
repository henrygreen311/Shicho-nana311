const fs = require('fs');
const axios = require('axios');
const { firefox } = require('playwright');
const { HttpsProxyAgent } = require('https-proxy-agent');

function getRandomUserAgent(filePath) {
  const userAgents = fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(ua => ua.trim())
    .filter(ua => ua.length > 0);
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const delay = ms => new Promise(res => setTimeout(res, ms));
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function spoofDetection(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => Math.floor(Math.random() * 7) + 2 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => Math.floor(Math.random() * 13) + 4 });

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

async function humanScroll(page) {
  const maxScroll = await page.evaluate(() => document.body.scrollHeight);
  let currentY = 0;
  const viewportHeight = randomBetween(600, 900);

  while (currentY < maxScroll) {
    const step = randomBetween(50, 200);
    currentY = Math.min(currentY + step, maxScroll);
    await page.evaluate(_y => window.scrollTo(0, _y), currentY);
    await delay(randomBetween(100, 300));
    if (Math.random() < 0.2) await delay(randomBetween(500, 1500));
  }

  currentY = Math.max(currentY - randomBetween(viewportHeight / 2, viewportHeight), 0);
  await page.evaluate(_y => window.scrollTo(0, _y), currentY);
  await delay(randomBetween(200, 600));

  await delay(randomBetween(500, 2000));
}

async function randomClick(page) {
  const elements = await page.$$('a, button, [role="button"], [onclick]');
  if (elements.length > 0 && Math.random() < 0.7) {
    const randomElement = elements[randomBetween(0, elements.length - 1)];
    const boundingBox = await randomElement.boundingBox();
    if (boundingBox) {
      const x = boundingBox.x + boundingBox.width / 2 + randomBetween(-10, 10);
      const y = boundingBox.y + boundingBox.height / 2 + randomBetween(-10, 10);
      await page.mouse.move(x, y, { steps: randomBetween(5, 10) });
      await delay(randomBetween(50, 200));
      await page.mouse.click(x, y);
    }
  }
}

async function humanInteraction(page) {
  const hoverableElements = await page.$$('a, button, div, img');
  if (hoverableElements.length > 0 && Math.random() < 0.8) {
    const randomElement = hoverableElements[randomBetween(0, hoverableElements.length - 1)];
    try {
      await randomElement.hover({ timeout: 5000 });
      await delay(randomBetween(200, 600));
    } catch (_) {}
  }

  const input = await page.$('input[type="text"], input[type="search"]');
  if (input && Math.random() < 0.5) {
    const searchTerms = ['test query', 'example', 'search term', 'hello world'];
    const term = searchTerms[randomBetween(0, searchTerms.length - 1)];
    await input.type(term, { delay: randomBetween(80, 150) });
    await delay(randomBetween(500, 1500));
  }

  if (Math.random() < 0.3) {
    await randomClick(page);
  }
}

async function handlePopUp(page) {
  try {
    const popUpSelectors = [
      'div[class*="modal"]',
      'div[class*="popup"]',
      'div[class*="overlay"]',
      'div[id*="modal"]',
      'div[id*="popup"]',
      'div[role="dialog"]',
      'div[aria-modal="true"]'
    ].join(', ');

    const popUp = await page.$(popUpSelectors);
    if (popUp) {
      const closeButton = await popUp.$('button, .close, [aria-label="close"]');
      if (closeButton) {
        const box = await closeButton.boundingBox();
        if (box) {
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          await page.mouse.move(x, y);
          await delay(randomBetween(50, 150));
          await closeButton.click();
          await delay(1000);
          return true;
        }
      }
      await page.keyboard.press('Escape');
      await delay(1000);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function interactWithUrl(proxy, userAgent, url) {
  const width = randomBetween(1280, 1440);
  const height = randomBetween(720, 900);
  const context = await firefox.launchPersistentContext('', {
    headless: false,
    viewport: { width, height },
    userAgent,
    proxy: { server: `http://${proxy}` }
  });

  const page = await context.newPage();
  await spoofDetection(page);

  let isValid = false;

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
    const content = await page.content();

    if (content.includes("Anonymous Proxy detected")) {
      console.log(`Proxy rejected as anonymous: ${proxy}`);
    } else {
      console.log(`Proxy passed: ${proxy}`);
      isValid = true;

      await delay(15000);
      await handlePopUp(page);
      await humanScroll(page);
      await randomClick(page);
      await humanInteraction(page);
    }
  } catch (e) {
    console.log(`Proxy failed to load URL: ${proxy} (${e.message})`);
  } finally {
    await context.close();
  }

  return isValid;
}

async function fetchProxies() {
  const res = await axios.get('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=3000&country=all&ssl=all&anonymity=elite');
  return res.data.split('\n').map(p => p.trim()).filter(Boolean).slice(0, 500);
}

async function isProxyValid(proxy) {
  const agent = new HttpsProxyAgent(`http://${proxy}`);
  try {
    const test = await axios.get('https://example.com/', {
      httpAgent: agent,
      httpsAgent: agent,
      timeout: 4000
    });

    if (test.status === 200) {
      const geo = await axios.get(`https://ipapi.co/${proxy.split(':')[0]}/json/`, { timeout: 4000 });
      const country = geo.data?.country;
      if (country === 'US' || country === 'CA') {
        console.log(`Skipping proxy from ${country}: ${proxy}`);
        return null;
      }
      return { proxy, country };
    }
  } catch (_) {}
  return null;
}

function chunk(array, size) {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  );
}

(async () => {
  const url = 'https://convictionfoolishbathroom.com/spgbsmce6y?key=b7b18ab0269611b5429b01935d29fe65';
  const tested = new Set();

  while (true) {
    const proxies = await fetchProxies();
    console.log(`Fetched ${proxies.length} proxies.`);

    for (const proxy of proxies) {
      if (tested.has(proxy)) continue;

      const result = await isProxyValid(proxy);
      if (!result) continue;

      const { proxy: validProxy } = result;

      let success = await interactWithUrl(validProxy, getRandomUserAgent('user_agents.txt'), url);
      if (success) {
        for (let i = 1; i < 5; i++) {
          console.log(`Reusing proxy ${validProxy} - attempt ${i + 1}/5`);
          await interactWithUrl(validProxy, getRandomUserAgent('user_agents.txt'), url);
        }
        tested.add(validProxy);
      } else {
        console.log(`Skipping ${validProxy} after failed initial attempt.`);
        tested.add(validProxy);
      }
    }

    console.log('All proxies in batch tested. Refetching new list...\n');
    await delay(5000);
  }
})();
