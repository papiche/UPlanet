const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium'
  });

  const page = await browser.newPage();

  const zoomLevel = 13;
  const tilesAroundCenter = 2; // Adjust as needed

  const tileSize = 360 / Math.pow(2, zoomLevel);
  const tileCount = (2 * tilesAroundCenter) + 1;

  const tileIncrement = tileSize * tileCount;

  const centerLat = 51.000;
  const centerLon = 0.000;

  for (let latOffset = -tilesAroundCenter; latOffset <= tilesAroundCenter; latOffset++) {
    for (let lonOffset = -tilesAroundCenter; lonOffset <= tilesAroundCenter; lonOffset++) {
      const tileLat = centerLat + latOffset * tileIncrement;
      const tileLon = centerLon + lonOffset * tileIncrement;

//~ http://ipfs.asycn.io/ipfs/QmZzE8ypb2q9CF93B8gbjif3Qpqhsrh8y5DtgPPwGYTpdP/map_render.html?southWestLat=${tileLat}&southWestLon=${tileLon}&deg=1

      const url = `file:///home/fred/workspace/OSM2IPFS/earth/Umap.html?southWestLat=${tileLat}&southWestLon=${tileLon}&deg=0.01`;

      await page.goto(url);
      await page.waitForTimeout(2000);

      const fileName = `map_${tileLat.toFixed(6)}_${tileLon.toFixed(6)}.png`;

      await page.screenshot({ path: fileName });
    }
  }

  await browser.close();
})();
