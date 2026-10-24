<h1><img width="42" height="42" alt="icon" src="https://github.com/user-attachments/assets/41f265a0-423b-45cc-bd79-18cc661819fb"/>&nbsp; World Clocks</h1>

[![GitHub release](https://img.shields.io/github/v/release/caiopizzol/world-clocks)](https://github.com/caiopizzol/world-clocks/releases)

A Chrome extension that replaces your new tab page with a world clock dashboard and interactive map.
<img width="1280" height="720" alt="screenshot of the extension"  src="https://github.com/user-attachments/assets/a9b28ecb-8e53-4944-acfe-f56b5cbf9293" />

## Features

- **World map** with pinned city markers (bundled SVG with Leaflet; works offline, no API key)
- **Sidebar** showing live clocks for each pinned city
- **Search** to add any city from 400+ worldwide
- **Dark / Light / System** theme toggle
- Cities sorted by longitude (left-to-right on the map)
- Pinned cities persist across sessions via localStorage

## Install

1. Clone this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select this folder

## Usage

- Drag to pan; scroll, pinch, or use the +/- controls to zoom.
- Hover over a faint city dot to see its name; click it to pin the city.
- Click a glowing pinned dot to unpin its city.
- Search by city or country; country matches appear first and pinned cities are marked.
- Move the cursor over the map to see the nearest listed city's local time.
- Country names fade into the map; crowded labels hide when zoomed out.
- Hover over a city in the sidebar or on the map to reveal the remove button
- Click the theme toggle in the bottom-right of the sidebar to switch themes.
- Use the globe beside the theme button to toggle satellite imagery independently; the choice persists across refreshes.

## Map data

`world-map.svg` uses public-domain [Natural Earth](https://www.naturalearthdata.com/) 1:110m country boundaries (v5.1.2), projected to Web Mercator to align with city pins. The map is included in the extension; no external tiles are requested.

The satellite view bundles NASA's [Blue Marble: Next Generation with Topography](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/) July 2004 composite, credited to Reto Stoeckli / NASA Earth Observatory. It is a static satellite composite, not live imagery. The [5400 x 2700 source](https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg) was reprojected from equirectangular to Web Mercator (latitude limits +/-85.0511287798), then stored as a 4096 x 4096 JPEG. It requires no API key or network connection at runtime.

## Authors

- [Caio Pizzol](https://github.com/caiopizzol)
- [Matthew Connelly](https://github.com/mattConn)

## License

[MIT](LICENSE)
