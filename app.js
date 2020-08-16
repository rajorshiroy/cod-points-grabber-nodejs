const fs = require('fs')
const puppeteer = require('puppeteer');
const prompt = require('prompt-sync')({sigint: true});
const {blizzardEmail, blizzardPassword} = require('./config');

const getYoutubeLiveComments = async (liveVideoUrl, isDebugMode) => {
    console.log('youtube live url detected');

    const browser = await puppeteer.launch({headless: !isDebugMode, defaultViewport: null});

    // get cookies from blizzard battle.net
    const blizzardCookies = await getBlizzardCookies(browser);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/64.0.3282.39 Safari/537.36');
    await page.goto(liveVideoUrl);

    // switch to the chat iframe
    await page.waitFor('iframe#chatframe')
    console.log('iframe is ready. Loading iframe content');

    // keep refreshing the messages
    setInterval(async () => {
        const elementHandle = await page.$('iframe#chatframe');
        const chatFrame = await elementHandle.contentFrame();

        let messages = await chatFrame.evaluate(() => {
            return Array.from(document.querySelectorAll('span#message')).map(
                message => {
                    const text = message.innerText.trim();
                    if (text !== '')
                        return text;
                }
            )
        });

        if (isDebugMode)
            console.log('-------------------------------------------');

        for (const message of messages) {
            if (message) {
                let codeMatches = message.match(/(\w{2,10}-){3,10}(\w{2,10})/mg);
                if (codeMatches !== null) {
                    try {
                        const code = codeMatches[0];

                        // save code to txt file
                        fs.appendFile('codes.txt', code + '\n', (err) => {
                            if (err) console.log(err);
                            console.log('Saved!');
                        });

                        console.log('======================== code found ========================');
                        console.log(code);
                        console.log('============================================================');
                        await redeemCode(blizzardCookies, code);
                    } catch (e) {
                        console.log(e);
                    }
                } else if (isDebugMode)
                    console.log(message);
            }
        }
        console.log(`${Date.now()}| ${messages.length} messages found on live feed`)
    }, 200);
};

const getTwitchComments = async (liveVideoUrl, isDebugMode) => {
    console.log('twitch url detected');
    const browser = await puppeteer.launch({headless: false, defaultViewport: null});

    // get cookies from blizzard battle.net
    const blizzardCookies = await getBlizzardCookies(browser);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/64.0.3282.39 Safari/537.36');
    await page.goto(liveVideoUrl);

    // switch to the chat fragment to load
    await page.waitFor('.text-fragment')
    console.log('chat has been loaded. getting messages...');

    // keep refreshing the messages
    setInterval(async () => {

        let messages = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.text-fragment')).map(
                message => {
                    const text = message.innerText.trim();
                    if (text !== '')
                        return text;
                }
            )
        });

        if (isDebugMode)
            console.log('-------------------------------------------');

        for (const message of messages) {
            if (message) {
                let codeMatches = message.match(/(\w{2,10}-){3,10}(\w{2,10})/mg);
                if (codeMatches !== null) {
                    const code = codeMatches[0];
                    console.log('======================== code found ========================');
                    console.log(code);
                    console.log('============================================================');
                    await redeemCode(blizzardCookies, code);
                } else if (isDebugMode)
                    console.log(message);
            }
        }
        console.log(`${messages.length} messages found on live feed`)
    }, 100);
};

const getBlizzardCookies = async (browser) => {
    console.log('logging into battle.net account')
    const loginUrl = 'https://us.battle.net/login/en/?ref=https://us.battle.net/shop/en/checkout/key-claim&app=shop';
    const email = blizzardEmail;
    const password = blizzardPassword;
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/64.0.3282.39 Safari/537.36');
    await page.goto(loginUrl);

    // console.log('inserting email');
    await page.type('#accountName', email, {delay: 50});

    // console.log('inserting password');
    await page.type('#password', password, {delay: 50});

    // console.log('submitting');
    await page.evaluate(() => {
        document.querySelector('#submit').click();
    });

    try {
        // wait for next page to load
        await page.waitFor('#enter-code-input', {timeout: 8000})
        console.log('logged in!')
    } catch (e) {
        console.log('security code required. a code should be sent to your registered email.')
        const securityCode = prompt('Security code: ').trim();

        // enter the security code and continue
        await page.type('#email', securityCode, {delay: 50})
        await page.evaluate(() => {
            document.querySelector('#challenge-submit').click();
        })
        await page.waitFor('#enter-code-input', {timeout: 5000})
        console.log('logged in!')
    }


    // return the cookies
    const cookies = (await page.cookies()).map(ck => `${ck["name"]}=${ck["value"]}`)
    await page.close();
    return cookies.join('; ');
}

const redeemCode = async (cookie, code) => {
    console.log('redeeming code:', code);
    const url = `https://us.battle.net/shop/en/checkout/key-claim?keyCode=${code}` +
        '&returnUrl=https%3A%2F%2Fus.shop.battle.net%2F';

    await fetch(url,
        {
            "headers": {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9," +
                    "image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
                "accept-language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "same-origin",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1",
                "cookie": cookie
            },
            "referrer": "https://us.battle.net/shop/en/checkout/key-claim",
            "referrerPolicy": "no-referrer-when-downgrade",
            "body": null,
            "method": "GET",
            "mode": "cors"
        });
    console.log('code redeemed!');
}

const main = () => {
    const isDebugMode = process.argv.includes('debug');

    console.log('enter a twitch or youtube live stream url');
    const liveVideoUrl = prompt('Live video url: ').trim();
    if (liveVideoUrl.includes('youtube'))
        getYoutubeLiveComments(liveVideoUrl, isDebugMode).then(r => null);
    else if (liveVideoUrl.includes('twitch'))
        getTwitchComments(liveVideoUrl, isDebugMode).then(r => null);
    else
        console.log('invalid url');
}


main();
