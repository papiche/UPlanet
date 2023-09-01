const puppeteer = require('puppeteer');

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

(async() => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({width: 5960, height: 4209})
    await page.goto('https://ipfs.copylaradio.com/ipfs/QmYJ2Ri1ygL7ZFTamP3gcc5VZwxhE685bWJnXSVkvNFJfF/Umap.html?southWestLat=0.00&southWestLon=0.00&deg=0.01', {waitUntil: 'networkidle'});
    await timeout(10000)
    await page.screenshot({path: '/tmp/Umap.png'});
    browser.close();

})();
