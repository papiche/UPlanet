#!/usr/bin/python3
import argparse
import asyncio
from pyppeteer import launch

async def main(zoom_level, tile_lat, tile_lon):
    browser = await launch(headless=True, executablePath='/usr/bin/chromium')
    page = await browser.newPage()

    tileSize = 360 / pow(2, zoom_level)
    tile_count = 1  # In this case, capture a single tile

    tile_increment = tileSize * tile_count

    # Calculate tile coordinates based on input parameters
    tile_lat = float(tile_lat)
    tile_lon = float(tile_lon)

    url = f'https://ipfs.copylaradio.com/QmTJt12iDKtc57Gm6sT8VaJoYrLzwUUgxCrsexaouWzRb1/Umap.html?southWestLat={tile_lat}&southWestLon={tile_lon}&deg=0.01'

    await page.goto(url)

    # Wait for a longer time (e.g., 5 seconds) to ensure the page is fully loaded
    await asyncio.sleep(5)

    file_name = f'/tmp/Umap_{tile_lat:.3f}_{tile_lon:.3f}.png'

    await page.screenshot({'path': file_name})

    await browser.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Capture a map tile screenshot with custom parameters")
    parser.add_argument("--zoom", type=int, help="Zoom level")
    parser.add_argument("--lat", type=float, help="Tile latitude")
    parser.add_argument("--lon", type=float, help="Tile longitude")
    args = parser.parse_args()

    if not args.zoom or not args.lat or not args.lon:
        print("Please provide valid values for zoom, lat, and lon.")
    else:
        asyncio.get_event_loop().run_until_complete(main(args.zoom, args.lat, args.lon))
