// ── State ──
let allCities = [];
let pinnedCities = [];
let map = null;
let markers = [];
let tileLayer = null;

const DEFAULT_CITIES = ["London", "São Paulo", "New Delhi", "Denver", "San Francisco", "Kyiv"];

const STORAGE_KEY = "world-clocks-pinned";
const THEME_KEY = "world-clocks-theme";

const TILES = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
};

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
    if (Array.isArray(saved) && saved.length > 0) {
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

  // Swap tile layer
  const url = resolved === "light" ? TILES.light : TILES.dark;
  if (tileLayer) {
    tileLayer.setUrl(url);
  }

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

function initTheme() {
  applyTheme();

  document.getElementById("themeToggle").addEventListener("click", cycleTheme);

  // React to system theme changes when in 'system' mode
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getThemePref() === "system") applyTheme();
  });
}

// ── Remove a city by index ──
function removeCity(idx) {
  pinnedCities.splice(idx, 1);
  renderMarkers();
  renderList();
  savePinned();
}

// ── Initialize Leaflet map ──
function initMap() {
  map = L.map("map", {
    center: [25, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 2,
    zoomControl: false,
    attributionControl: true,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    boxZoom: false,
    keyboard: false,
  });

  const resolved = resolveTheme(getThemePref());
  const url = resolved === "light" ? TILES.light : TILES.dark;

  tileLayer = L.tileLayer(url, {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);
}

// ── Render Leaflet markers ──
function renderMarkers() {
  markers.forEach((m) => {
    map.removeLayer(m);
  });
  markers = [];

  pinnedCities.forEach((city, i) => {
    const icon = L.divIcon({
      className: "",
      html: '<div class="pulse-marker"></div>',
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });

    const marker = L.marker([city.lat, city.lng], { icon }).addTo(map);

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
  const input = document.getElementById("searchInput");
  const dropdown = document.getElementById("searchDropdown");
  let results = [];
  let selectedIdx = -1;

  function addCity(city) {
    pinnedCities.push(city);
    sortPinned();
    renderMarkers();
    renderList();
    savePinned();
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
    results = allCities
      .filter(
        (c) =>
          !pinnedNames.has(c.name) &&
          (c.name.toLowerCase().includes(q) || c.tz.toLowerCase().includes(q)),
      )
      .slice(0, 8);

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
          c.tz.split("/").pop().replace(/_/g, " ") +
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
async function init() {
  initMap();
  initTheme();

  const resp = await fetch(chrome.runtime.getURL("cities.json"));
  allCities = await resp.json();

  const savedNames = loadPinned();
  const namesToLoad = savedNames || DEFAULT_CITIES;
  pinnedCities = namesToLoad.map((name) => allCities.find((c) => c.name === name)).filter(Boolean);
  sortPinned();

  renderMarkers();
  renderList();
  initSearch();
  setInterval(updateTimes, 1000);
}

init();
