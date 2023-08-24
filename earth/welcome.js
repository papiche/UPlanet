// Set up initial variables
const tileSize = 10; // 10° interval
const gridSize = 36;
const initialZoom = 1; // Choose an initial zoom level

// Create the map
const map = L.map('map').setView([0, 0], initialZoom);

// Add OpenStreetMap tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'U Planet'
}).addTo(map);

// Create a clickable area for each grid cell
for (let latIndex = 0; latIndex < gridSize; latIndex++) {
  for (let lonIndex = 0; lonIndex < gridSize; lonIndex++) {
    const lat = -180 + latIndex * tileSize;
    const lon = -180 + lonIndex * tileSize;

    // Create a clickable rectangle
    const rectangle = L.rectangle(
      [[lat, lon], [lat + tileSize, lon + tileSize]],
      { color: 'transparent', weight: 1, className: 'clickable-area' } // Add CSS class
    );

    // Add a click event to the rectangle
    rectangle.on('click', () => {
      const url = `map_render.html?southWestLat=${lat}&southWestLon=${lon}`;
      window.location.href = url;
    });

    // Add the rectangle to the map
    rectangle.addTo(map);
  }
}
