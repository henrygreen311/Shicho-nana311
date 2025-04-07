const { chromium } = require('playwright');
const readline = require('readline');

(async () => {
    const browser = await chromium.launchPersistentContext('/home/runner/sportybet', {
        headless: false,
        args: ['--no-sandbox']
    });

    const page = await browser.newPage();

    try {
        await page.goto('https://www.sportybet.com/ng/games?source=TopRibbon', {
            waitUntil: 'domcontentloaded'
        });

        const loginButton = await page.$('button.m-btn-login[name="logIn"]');
        if (loginButton && await loginButton.isVisible()) {
            console.log("Oops we are logged out tryna logging back");
            await loginButton.click();
        }

        const iframeElement = await page.waitForSelector('iframe#games-lobby', { timeout: 15000 });
        const frame = await iframeElement.contentFrame();

        if (!frame) {
            console.error("Failed to access iframe content.");
            await browser.close();
            return;
        }

        await frame.waitForSelector('.image-holder', { timeout: 15000 });

        const imageHolders = await frame.$$('.image-holder');
        const targetSrc = 'https://s.sporty.net/sportygames/lobby_banner/1648540402134.png';
        let clicked = false;

        for (const holder of imageHolders) {
            const img = await holder.$(`img[src="${targetSrc}"]`);
            if (img) {
                await holder.click();
                console.log("Clicked on the matching image-holder inside iframe.");
                clicked = true;
                break;
            }
        }

        if (!clicked) {
            console.log("No matching image-holder found inside iframe.");
        }

        // Force looking for the turbo iframe inside the first iframe
        const turboIframeSelector = 'iframe.turbo-games-iframe';
        const turboIframeElement = await frame.waitForSelector(turboIframeSelector, { timeout: 60000 });

        if (turboIframeElement) {
            console.log("Found the turbo iframe inside the first iframe!");

            // Switch context to the turbo iframe
            const turboFrame = await turboIframeElement.contentFrame();
            if (turboFrame) {
                console.log("Switched to the turbo iframe.");

                // Wait for navigation switcher and the 'Auto' button to be visible
                const navigationSwitcherSelector = 'app-navigation-switcher .navigation-switcher';
                await turboFrame.waitForSelector(navigationSwitcherSelector, { timeout: 15000 });

                // Use XPath for 'Auto' button
                const autoButtonXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/app-navigation-switcher/div/button[2]';
                const autoButton = await turboFrame.waitForSelector(`xpath=${autoButtonXPath}`, { visible: true, timeout: 15000 });

                if (autoButton) {
                    console.log("Found navigation switcher and 'Auto' button, waiting 10 seconds before clicking...");

                    // Wait 10 seconds before clicking the "Auto" button
                    await turboFrame.waitForTimeout(10000);

                    // Scroll the "Auto" button into view using a more aggressive method
                    await turboFrame.evaluate((autoButton) => {
                        if (autoButton) {
                            autoButton.scrollIntoView();
                        }
                    }, autoButton);

                    // Click the "Auto" button using XPath logic
                    await autoButton.click();
                    console.log("Clicked on the 'Auto' button inside the turbo iframe.");
                } else {
                    console.error("Failed to locate the 'Auto' button.");
                }

                // Click the "Cashout" button 5 times
                const cashoutButtonXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/div[1]/div[1]/app-spinner/div/div[1]/button';
                const cashoutButton = await turboFrame.waitForSelector(`xpath=${cashoutButtonXPath}`, { visible: true, timeout: 15000 });

                if (cashoutButton) {
                    for (let i = 0; i < 5; i++) {
                        console.log(`Clicking the "Cashout" button: Attempt ${i + 1}`);
                        await cashoutButton.click();
                        await turboFrame.waitForTimeout(2000); // wait for 2 seconds between each click
                    }
                    console.log("Clicked the 'Cashout' button 5 times.");
                } else {
                    console.error("Failed to locate the 'Cashout' button.");
                }

                // Click on "Set cash out limit"
                const setCashOutLimitXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/div[3]/div[2]/div[1]/app-ui-switcher/div';
                const setCashOutLimitButton = await turboFrame.waitForSelector(`xpath=${setCashOutLimitXPath}`, { visible: true, timeout: 15000 });

                if (setCashOutLimitButton) {
                    console.log("Found and clicking the 'Set cash out limit' button.");
                    await setCashOutLimitButton.click();
                    await turboFrame.waitForTimeout(2000); // wait for 2 seconds after clicking
                } else {
                    console.error("Failed to locate the 'Set cash out limit' button.");
                }

                // Click on "Setting for automatically betting"
                const autoBettingSettingXPath = '/html/body/app-root/app-game/div/div[1]/div[2]/div/div[2]/div[3]/app-bet-controls/div/app-bet-control[1]/div/div[3]/div[1]/div/app-ui-switcher/div';
                const autoBettingSettingButton = await turboFrame.waitForSelector(`xpath=${autoBettingSettingXPath}`, { visible: true, timeout: 15000 });

                if (autoBettingSettingButton) {
                    console.log("Found and clicking the 'Setting for automatically betting' button.");
                    await autoBettingSettingButton.click();
                    await turboFrame.waitForTimeout(2000); // wait for 2 seconds after clicking
                } else {
                    console.error("Failed to locate the 'Setting for automatically betting' button.");
                }
            } else {
                console.error("Failed to switch to turbo iframe.");
            }
        } else {
            console.log("Turbo iframe not found inside the first iframe.");
        }

        // Wait for user input before closing
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question("Press ENTER to close the browser and exit script...", async () => {
            rl.close();
            await browser.close();
            console.log("Browser closed. Script exited.");
        });

    } catch (err) {
        console.error("Error occurred:", err.message);
        await browser.close();
    }
})();
