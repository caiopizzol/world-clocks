// ── State ──
let allCities = [];
let pinnedCities = [];
let map = null;
let markers = [];
let showUnpinned = false;

const DEFAULT_CITIES = ["London", "São Paulo", "New Delhi", "Denver", "San Francisco", "Kyiv"];

const STORAGE_KEY = "world-clocks-pinned";
const THEME_KEY = "world-clocks-theme";
const MAP_VIEW_KEY = "world-clocks-map-view";
const EARTH_KEY = "world-clocks-earth-view";

const THEME_ICONS = {
  system:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/>',
  dark: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
  light:
    '<circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42m12.72-12.72l1.42-1.42"/>',
};

const THEME_LABELS = {
  system: "System",
  dark: "Dark",
  light: "Light",
};

// ── Country code → flag emoji ──
function ccToFlag(cc) {
  return cc
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

// ── Sort pinned cities by longitude (left → right on map) ──
function sortPinned() {
  pinnedCities.sort((a, b) => a.lng - b.lng);
}

// ── Persistence ──
function savePinned() {
  const names = pinnedCities.map((c) => c.name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

function loadPinned() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) {
      return saved;
    }
  } catch {}
  return null;
}

// ── Theme ──
function getThemePref() {
  return localStorage.getItem(THEME_KEY) || "system";
}

function saveThemePref(pref) {
  localStorage.setItem(THEME_KEY, pref);
}

function resolveTheme(pref) {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function applyTheme() {
  const pref = getThemePref();
  const resolved = resolveTheme(pref);

  document.documentElement.classList.toggle("light", resolved === "light");

  // Update toggle button
  const icon = document.getElementById("themeIcon");
  const label = document.getElementById("themeLabel");
  if (icon) icon.innerHTML = THEME_ICONS[pref];
  if (label) label.textContent = THEME_LABELS[pref];
}

function cycleTheme() {
  const order = ["system", "dark", "light"];
  const current = getThemePref();
  const next = order[(order.indexOf(current) + 1) % order.length];
  saveThemePref(next);
  applyTheme();
}

function applyEarthView() {
  const enabled = localStorage.getItem(EARTH_KEY) === "true";
  document.documentElement.classList.toggle("earth-view", enabled);
  const button = document.getElementById("earthToggle");
  button.setAttribute("aria-pressed", String(enabled));
  button.title = enabled ? "Show illustrated map" : "Show satellite map";
  button.setAttribute("aria-label", button.title);
}

function initTheme() {
  applyTheme();

  document.getElementById("themeToggle").addEventListener("click", cycleTheme);
  applyEarthView();
  document.getElementById("earthToggle").addEventListener("click", () => {
    localStorage.setItem(EARTH_KEY, String(localStorage.getItem(EARTH_KEY) !== "true"));
    applyEarthView();
  });

  // React to system theme changes when in 'system' mode
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePref() === "system") applyTheme();
  });
}

// ── Remove a city by index ──
function pinCity(city) {
  if (pinnedCities.some((pinned) => pinned.name === city.name)) return;
  pinnedCities.push(city);
  sortPinned();
  renderMarkers();
  renderList();
  savePinned();
}

function removeCity(idx) {
  pinnedCities.splice(idx, 1);
  renderMarkers();
  renderList();
  savePinned();
}

// ── Initialize Leaflet map ──
function initDisplayOptions() {
  const bindToggle = (id, key, label, apply) => {
    const button = document.getElementById(id);
    let enabled = localStorage.getItem(key) === "true";
    const update = () => {
      button.setAttribute("aria-pressed", String(enabled));
      button.textContent = label;
      button.title = `${enabled ? "Hide" : "Show"} ${label.toLowerCase()}`;
      apply(enabled);
    };
    update();
    button.addEventListener("click", () => {
      enabled = !enabled;
      localStorage.setItem(key, String(enabled));
      update();
    });
  };
  bindToggle("showNames", "world-clocks-show-names", "Names", (enabled) => {
    document.documentElement.classList.toggle("hide-country-names", !enabled);
  });
  bindToggle("showUnpinned", "world-clocks-show-unpinned", "Unpinned", (enabled) => {
    showUnpinned = enabled;
    if (map) renderMarkers();
  });
}

function initCountryLabels(svg) {
  const labels = [...svg.querySelectorAll(".country-names text")]
    .map((element) => ({ element, priority: Number(element.getAttribute("font-size")) }))
    .sort((a, b) => b.priority - a.priority);
  let pending = false;
  const update = () => {
    pending = false;
    const scale = svg.getBoundingClientRect().width / 1024;
    if (!scale) return;
    // Keep text readable without letting it grow into neighboring countries.
    for (const { element, priority } of labels) {
      element.setAttribute("font-size", Math.max(10, Math.min(14, priority * scale)) / scale);
    }
    const viewport = map.getContainer().getBoundingClientRect();
    const measured = labels.map(({ element }) => ({
      element,
      box: element.getBoundingClientRect(),
    }));
    const occupied = [];
    for (const { element, box } of measured) {
      const outside =
        box.right < viewport.left ||
        box.left > viewport.right ||
        box.bottom < viewport.top ||
        box.top > viewport.bottom;
      const crowded = occupied.some(
        (other) =>
          box.left < other.right + 8 &&
          box.right > other.left - 8 &&
          box.top < other.bottom + 6 &&
          box.bottom > other.top - 6,
      );
      const visible = !outside && !crowded;
      element.style.visibility = visible ? "visible" : "hidden";
      if (visible) occupied.push(box);
    }
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  };
  map.on("zoomend moveend resize", schedule);
  schedule();
}

async function initMap() {
  map = L.map("map", {
    center: [25, 0],
    zoom: 2,
    zoomSnap: 0,
    minZoom: 0,
    maxZoom: 5,
    zoomControl: true,
    attributionControl: true,
    maxBounds: [
      [-85.0511287798, -180],
      [85.0511287798, 180],
    ],
    maxBoundsViscosity: 0.8,
  });

  const response = await fetch("world-map.svg");
  if (!response.ok) throw new Error("Could not load the bundled world map");
  const svg = new DOMParser().parseFromString(
    await response.text(),
    "image/svg+xml",
  ).documentElement;
  // Keep the imagery in the SVG so its projection, feathering and fade match exactly.
  svg.querySelector("g").classList.add("country-shapes");
  const satellite = document.createElementNS("http://www.w3.org/2000/svg", "image");
  satellite.setAttribute("class", "satellite-image");
  satellite.setAttribute("width", "1024");
  satellite.setAttribute("height", "1024");
  satellite.setAttribute("href", "world-map-satellite.jpg");
  satellite.setAttribute("preserveAspectRatio", "none");
  svg.insertBefore(satellite, svg.querySelector("g"));
  if (localStorage.getItem(EARTH_KEY) === "true") {
    const preload = new Image();
    preload.src = "world-map-satellite.jpg";
    await preload.decode();
  }
  L.svgOverlay(
    svg,
    [
      [-85.0511287798, -180],
      [85.0511287798, 180],
    ],
    {
      className: "world-map",
      attribution:
        '<a href="https://www.naturalearthdata.com/">Natural Earth</a> | Imagery: <a href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/">NASA Blue Marble</a>',
    },
  ).addTo(map);

  initCountryLabels(svg);

  const updateZoomLimit = () => {
    map.invalidateSize({ pan: false });
    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) return;
    // The full Web Mercator world is a 256px square at zoom zero.
    const wholeMapZoom = Math.log2(Math.min(size.x, size.y) / 256);
    map.setMinZoom(wholeMapZoom);
  };
  updateZoomLimit();

  // Start with the Americas through Asia in view, matching the reference framing.
  const fitMap = () => {
    map.invalidateSize();
    map.fitBounds(
      [
        [-45, -180],
        [83, 180],
      ],
      { padding: [0, 0], animate: false },
    );
  };
  let restoredView = false;
  try {
    const saved = JSON.parse(localStorage.getItem(MAP_VIEW_KEY));
    if (
      saved &&
      Number.isFinite(saved.lat) &&
      Number.isFinite(saved.lng) &&
      Number.isFinite(saved.zoom) &&
      Math.abs(saved.lat) <= 85.0511287798 &&
      Math.abs(saved.lng) <= 180
    ) {
      map.setView([saved.lat, saved.lng], saved.zoom, { animate: false });
      restoredView = true;
    }
  } catch {}
  if (!restoredView) fitMap();
  let exploring = restoredView;
  map.on("moveend", () => {
    const center = map.getCenter();
    localStorage.setItem(
      MAP_VIEW_KEY,
      JSON.stringify({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      }),
    );
  });

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "map-reset";
  resetButton.title = "Reset to default view";
  resetButton.setAttribute("aria-label", "Reset to default view");
  resetButton.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg>';
  L.DomEvent.disableClickPropagation(resetButton);
  resetButton.addEventListener("click", () => {
    map.stop();
    fitMap();
    exploring = false;
    localStorage.removeItem(MAP_VIEW_KEY);
  });
  map.zoomControl.getContainer().appendChild(resetButton);

  map.on("dragstart zoomstart", () => {
    exploring = true;
  });
  new ResizeObserver(() => {
    updateZoomLimit();
    if (!exploring) fitMap();
  }).observe(document.getElementById("map"));
}

// ── Render Leaflet markers ──
function renderMarkers() {
  markers.forEach((m) => {
    map.removeLayer(m);
  });
  markers = [];

  const pinnedNames = new Set(pinnedCities.map((city) => city.name));
  allCities
    .filter((city) => showUnpinned && !pinnedNames.has(city.name))
    .forEach((city) => {
      const icon = L.divIcon({
        className: "available-city",
        html: '<span class="available-city-dot"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker([city.lat, city.lng], {
        icon,
        title: `Pin ${city.name}`,
        alt: `Pin ${city.name}`,
        riseOnHover: true,
        zIndexOffset: -1000,
      }).addTo(map);
      const label = document.createElement("div");
      label.className = "city-label";
      label.textContent = `${ccToFlag(city.cc)} ${city.name}`;
      marker.bindTooltip(label, {
        direction: "top",
        offset: [0, -8],
        className: "city-tooltip",
      });
      marker.on("click", () => pinCity(city));
      markers.push(marker);
    });

  pinnedCities.forEach((city, i) => {
    const icon = L.divIcon({
      className: "",
      html: '<div class="pulse-marker"></div>',
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });

    const marker = L.marker([city.lat, city.lng], {
      icon,
      title: `Unpin ${city.name}`,
      alt: `Unpin ${city.name}`,
    }).addTo(map);
    marker.on("click", () => removeCity(i));

    const tooltipContent =
      '<div class="city-label">' +
      '<span class="cl-flag">' +
      ccToFlag(city.cc) +
      "</span>" +
      '<span class="cl-name">' +
      city.name +
      "</span>" +
      '<span class="cl-remove" data-idx="' +
      i +
      '">&times;</span>' +
      "</div>";

    marker.bindTooltip(tooltipContent, {
      permanent: true,
      direction: "top",
      offset: [0, -8],
      className: "city-tooltip",
      interactive: true,
    });

    markers.push(marker);
  });

  setTimeout(() => {
    document.querySelectorAll(".cl-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeCity(parseInt(btn.dataset.idx, 10));
      });
    });
  }, 50);
}

// ── Render sidebar clock list ──
function renderList() {
  const list = document.getElementById("clocksList");
  list.innerHTML = "";

  pinnedCities.forEach((city, i) => {
    const now = new Date();
    const abbr = now
      .toLocaleTimeString("en-US", {
        timeZone: city.tz,
        timeZoneName: "short",
      })
      .split(" ")
      .pop();

    const item = document.createElement("div");
    item.className = "clock-item";
    item.innerHTML =
      '<span class="ci-flag">' +
      ccToFlag(city.cc) +
      "</span>" +
      '<div class="ci-info">' +
      '<div class="ci-name">' +
      city.name +
      "</div>" +
      '<div class="ci-tz">' +
      abbr +
      "</div>" +
      "</div>" +
      '<div class="ci-time-col">' +
      '<div class="ci-time" data-tz="' +
      city.tz +
      '"></div>' +
      '<div class="ci-day" data-tz-day="' +
      city.tz +
      '"></div>' +
      "</div>" +
      '<div class="ci-remove-col">' +
      '<button class="ci-remove" data-idx="' +
      i +
      '">&times;</button>' +
      "</div>";
    list.appendChild(item);
  });

  list.querySelectorAll(".ci-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeCity(parseInt(btn.dataset.idx, 10));
    });
  });

  updateTimes();
}

// ── Update all displayed times ──
function updateTimes() {
  const now = new Date();

  document.querySelectorAll(".ci-time[data-tz]").forEach((el) => {
    el.textContent = now.toLocaleTimeString("en-US", {
      timeZone: el.dataset.tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  });

  document.querySelectorAll(".ci-day[data-tz-day]").forEach((el) => {
    el.textContent = now.toLocaleDateString("en-US", {
      timeZone: el.dataset.tzDay,
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  });
}

// ── Search ──
function initSearch() {
  const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  const countryNames = new Map(
    allCities.map((city) => [city.cc, regionNames.of(city.cc.toUpperCase()).toLowerCase()]),
  );
  const input = document.getElementById("searchInput");
  const dropdown = document.getElementById("searchDropdown");
  let results = [];
  let selectedIdx = -1;

  function addCity(city) {
    pinCity(city);
    input.value = "";
    dropdown.classList.remove("visible");
    results = [];
    selectedIdx = -1;
  }

  function updateHighlight() {
    dropdown.querySelectorAll(".search-result").forEach((el, i) => {
      el.classList.toggle("active", i === selectedIdx);
    });
    const active = dropdown.querySelector(".search-result.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function renderResults() {
    const q = input.value.trim().toLowerCase();
    selectedIdx = -1;

    if (q.length < 1) {
      dropdown.classList.remove("visible");
      results = [];
      return;
    }

    const pinnedNames = new Set(pinnedCities.map((c) => c.name));
    const matchRank = (city) => {
      if (countryNames.get(city.cc).includes(q)) return 0;
      if (city.name.toLowerCase().includes(q)) return 1;
      if (city.tz.toLowerCase().includes(q)) return 2;
      return 3;
    };
    results = allCities
      .filter((city) => matchRank(city) < 3)
      .sort((a, b) => matchRank(a) - matchRank(b) || a.name.localeCompare(b.name));

    if (results.length === 0) {
      dropdown.innerHTML = '<div class="search-empty">No cities found</div>';
      dropdown.classList.add("visible");
      return;
    }

    const now = new Date();
    dropdown.innerHTML = results
      .map((c, i) => {
        const time = now.toLocaleTimeString("en-US", {
          timeZone: c.tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        return (
          '<div class="search-result" data-idx="' +
          i +
          '">' +
          '<span class="sr-flag">' +
          ccToFlag(c.cc) +
          "</span>" +
          '<span class="sr-name">' +
          c.name +
          "</span>" +
          '<span class="sr-time">' +
          time +
          "</span>" +
          '<span class="sr-tz">' +
          (pinnedNames.has(c.name) ? "Pinned" : c.tz.split("/").pop().replace(/_/g, " ")) +
          "</span>" +
          "</div>"
        );
      })
      .join("");

    dropdown.classList.add("visible");

    dropdown.querySelectorAll(".search-result").forEach((el) => {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        addCity(results[parseInt(el.dataset.idx, 10)]);
      });
      el.addEventListener("mouseenter", () => {
        selectedIdx = parseInt(el.dataset.idx, 10);
        updateHighlight();
      });
    });
  }

  input.addEventListener("input", renderResults);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      dropdown.classList.remove("visible");
      results = [];
      selectedIdx = -1;
      input.blur();
      return;
    }

    if (!dropdown.classList.contains("visible") || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = selectedIdx < results.length - 1 ? selectedIdx + 1 : 0;
      updateHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = selectedIdx > 0 ? selectedIdx - 1 : results.length - 1;
      updateHighlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < results.length) {
        addCity(results[selectedIdx]);
      }
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      dropdown.classList.remove("visible");
      results = [];
      selectedIdx = -1;
    }, 200);
  });
}

// ── Init ──
// Use the nearest catalogued city's timezone, including its daylight-saving rules.
function initCursorTime() {
  const radians = Math.PI / 180;
  const locations = allCities.map((city) => {
    const lat = city.lat * radians;
    const lng = city.lng * radians;
    return {
      city,
      x: Math.cos(lat) * Math.cos(lng),
      y: Math.cos(lat) * Math.sin(lng),
      z: Math.sin(lat),
    };
  });
  const content = document.createElement("div");
  const location = document.createElement("div");
  const time = document.createElement("div");
  location.className = "cursor-time-location";
  time.className = "cursor-time-value";
  content.append(location, time);
  const tooltip = L.tooltip({
    direction: "bottom",
    offset: [0, 18],
    className: "cursor-time-tooltip",
    opacity: 1,
    interactive: false,
  }).setContent(content);
  let currentCity = null;
  let formatter = null;

  const update = () => {
    if (formatter) time.textContent = formatter.format(new Date());
  };
  const hide = () => {
    tooltip.remove();
    currentCity = null;
    formatter = null;
  };
  map.getContainer().addEventListener("mousemove", (event) => {
    if (map.dragging.moving() || event.target.closest(".leaflet-control")) {
      hide();
      return;
    }
    const point = map.mouseEventToLatLng(event);
    if (Math.abs(point.lng) > 180 || Math.abs(point.lat) > 85.0511287798) {
      hide();
      return;
    }
    const lat = point.lat * radians;
    const lng = point.lng * radians;
    const x = Math.cos(lat) * Math.cos(lng);
    const y = Math.cos(lat) * Math.sin(lng);
    const z = Math.sin(lat);
    let nearest = null;
    let best = -Infinity;
    for (const entry of locations) {
      const score = x * entry.x + y * entry.y + z * entry.z;
      if (score > best) {
        best = score;
        nearest = entry.city;
      }
    }
    if (!nearest) return;
    if (nearest !== currentCity) {
      currentCity = nearest;
      location.textContent = `Near ${nearest.name}`;
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: nearest.tz,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
      update();
    }
    tooltip.setLatLng(point);
    if (!map.hasLayer(tooltip)) tooltip.addTo(map);
  });
  map.getContainer().addEventListener("mouseleave", hide);
  map.on("movestart", hide);
  setInterval(update, 1000);
}

async function init() {
  initTheme();
  initDisplayOptions();
  await initMap();

  const resp = await fetch(chrome.runtime.getURL("cities.json"));
  allCities = await resp.json();

  const savedNames = loadPinned();
  const namesToLoad = savedNames || DEFAULT_CITIES;
  pinnedCities = namesToLoad.map((name) => allCities.find((c) => c.name === name)).filter(Boolean);
  sortPinned();

  renderMarkers();
  renderList();
  initSearch();
  initCursorTime();
  setInterval(updateTimes, 1000);
}

init();
