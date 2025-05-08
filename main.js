const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

// Redirect all console output to logs.txt
const logStream = fs.createWriteStream('logs.txt', { flags: 'a' });
['log', 'error', 'warn', 'info'].forEach(method => {
  console[method] = (...args) => {
    const message = args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ') + '\n';
    logStream.write(`[${method.toUpperCase()}] ${message}`);
  };
});

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
  const chromiumPath = '/usr/bin/chromium';

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

    // [Everything else remains unchanged...]
    // The rest of the script continues unchanged from your provided code
})();
