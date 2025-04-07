const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Step 1: Login
        await page.goto('https://www.sportybet.com/ng/login');
        console.log("Navigated to login page.");

        await page.waitForSelector('input[name="phone"]', { timeout: 10000 });
        await page.fill('input[name="phone"]', '9120183273');

        await page.waitForSelector('input[type="password"]', { timeout: 10000 });
        await page.fill('input[type="password"]', 'Edmond99');

        const loginButton = await page.waitForSelector('button.af-button--primary', { timeout: 10000 });
        await loginButton.click();
        console.log("Clicked login button.");

        await page.waitForTimeout(5000); // Wait before proceeding

        // Step 2: Navigate to games page
        await page.goto('https://www.sportybet.com/ng/games?source=TopRibbon');
        console.log("Navigated to games page.");

        // Step 3: Access first iframe and click image
        const outerFrameElement = await page.waitForSelector('iframe#games-lobby', { timeout: 10000 });
        const outerFrame = await outerFrameElement.contentFrame();

        const imageHolder = await outerFrame.waitForSelector('.image-holder', { timeout: 10000 });
        const targetImg = await imageHolder.$('img[src*="1648540402134.png"]');

        if (targetImg) {
            await imageHolder.click();
            console.log("Clicked on the matching image-holder inside iframe.");
        }

        // Step 4: Wait for turbo iframe and switch to it
        await page.waitForTimeout(5000);
        const turboIframeElement = await outerFrame.waitForSelector('iframe.turbo-games-iframe', { timeout: 10000 });
        const turboFrame = await turboIframeElement.contentFrame();

        console.log("Found the turbo iframe inside the first iframe!");
        console.log("Switched to the turbo iframe.");

        // Step 5: Scroll to view and click 'Auto' button via XPath
        const autoBtnXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/app-navigation-switcher/div/button[2]';
        const autoBtn = await turboFrame.waitForSelector(`xpath=${autoBtnXPath}`, { timeout: 10000 });

        if (autoBtn) {
            await autoBtn.scrollIntoViewIfNeeded();
            await turboFrame.waitForTimeout(10000);
            await autoBtn.click();
            console.log("Clicked on the 'Auto' button inside the turbo iframe.");
        }

        // Step 6: Click 'Cashout' button 5 times
        const cashoutXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/div[1]/div[1]/app-spinner/div/div[1]/button';
        for (let i = 0; i < 5; i++) {
            const cashoutBtn = await turboFrame.waitForSelector(`xpath=${cashoutXPath}`, { timeout: 10000 });
            if (cashoutBtn) {
                await cashoutBtn.click();
                await turboFrame.waitForTimeout(500);
            }
        }
        console.log("Clicked cashout button 5 times.");

        // Step 7: Click 'Set cash out limit'
        const setLimitXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/div[3]/div[2]/div[1]/app-ui-switcher/div';
        const setLimitBtn = await turboFrame.waitForSelector(`xpath=${setLimitXPath}`, { timeout: 10000 });
        if (setLimitBtn) {
            await setLimitBtn.click();
            console.log("Clicked on 'Set cash out limit'.");
        }

        // Step 8: Input 1.10 in the field to make it 1.20
        const inputXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/div[3]/div[2]/div[2]/div/app-spinner/div/div[2]/input';
        const inputField = await turboFrame.waitForSelector(`xpath=${inputXPath}`, { timeout: 10000 });
        if (inputField) {
            await inputField.fill('1.20');
            console.log("Set cash out limit to 1.20.");
        }

        // Step 9: Click 'Setting for automatically betting'
        const autoBetXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/div[3]/div[1]/div/app-ui-switcher/div';
        const autoBetBtn = await turboFrame.waitForSelector(`xpath=${autoBetXPath}`, { timeout: 10000 });
        if (autoBetBtn) {
            await autoBetBtn.click();
            console.log("Clicked on 'Setting for automatically betting'.");
        }

        // Final wait for user to close
        console.log("Press ENTER to close the browser and exit script...");
        process.stdin.once('data', async () => {
            await browser.close();
            console.log("Browser closed. Script exited.");
            process.exit();
        });

    } catch (error) {
        console.error("Error occurred:", error.message);
        await browser.close();
        console.log("Browser closed due to error.");
    }
})();
