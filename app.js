(function attachApp(globalObject) {
  if (typeof document === "undefined" || !globalObject.TourTrackerCore) {
    return;
  }

  const APP_MODE =
    globalObject.location && /^\/admin\/?$/.test(globalObject.location.pathname)
      ? "admin"
      : "public";
  const STORAGE_KEY = "mytourtimes-config-v2";
  const DB_NAME = "mytourtimes-browser-store";
  const DB_VERSION = 1;
  const DB_STORE = "app_state";
  const DB_CONFIG_KEY = "config";
  const BACKUP_STORAGE_KEY = "mytourtimes-config-backups-v1";
  const MAX_CONFIG_BACKUPS = 12;
  const CSV_SESSION_KEY = "mytourtimes-last-csv-v1";
  const CSV_PERSIST_KEY = "mytourtimes-last-csv-persist-v1";
  const FLIGHT_ANNOTATIONS_STORAGE_KEY = "mytourtimes-flight-annotations-v1";
  const WEATHER_HISTORY_DAYS = 7;
  const WEATHER_HISTORY_MS = WEATHER_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const WEATHER_REQUEST_TIMEOUT_MS = 5500;
  const WEATHER_LOADING_FAILSAFE_MS = 6500;
  const SHARED_STATE_REFRESH_MS = 30000;
  const LOADING_AUTO_HIDE_MS = 12000;
  const LOADING_SHOW_DELAY_MS = 700;
  const GOAL_BUFFER_MINUTES =
    typeof globalObject.TourTrackerCore.GOAL_BUFFER_MINUTES === "number"
      ? globalObject.TourTrackerCore.GOAL_BUFFER_MINUTES
      : 0.5;
  const FLIGHT_REASON_OPTIONS = [
    "Photo Flight",
    "Maintenance",
    "Training",
    "Ferry Flight",
    "Check Ride",
    "Weather Delay",
    "Other",
  ];
  const LOCATION_STATION_DEFAULTS = {
    detroit: ["KDET"],
    milwaukee: ["KMKE"],
    philly: ["KPNE"],
    philadelphia: ["KPNE"],
    baltimore: ["KMTN"],
    "ocean city": ["KOXB"],
    "st. ignace": ["83D"],
    "st ignace": ["83D"],
    smoky: ["KGKT"],
    "smoky mountains": ["KGKT"],
  };
  const core = globalObject.TourTrackerCore;

  const elements = {
    statusBanner: document.getElementById("statusBanner"),
    csvInput: document.getElementById("csvInput"),
    csvDropZone: document.getElementById("csvDropZone"),
    importConfigInput: document.getElementById("importConfigInput"),
    adminTabButton: document.getElementById("adminTabButton"),
    adminLogoutBtn: document.getElementById("adminLogoutBtn"),
    publishStateBtn: document.getElementById("publishStateBtn"),
    clearSheetBtn: document.getElementById("clearSheetBtn"),
    kmlInput: document.getElementById("kmlInput"),
    mappingPanel: document.getElementById("mappingPanel"),
    csvMeta: document.getElementById("csvMeta"),
    adminCsvMeta: document.getElementById("adminCsvMeta"),
    summaryCards: document.getElementById("summaryCards"),
    dashboardCards: document.getElementById("dashboardCards"),
    dashboardDetail: document.getElementById("dashboardDetail"),
    dateRangeLabel: document.getElementById("dateRangeLabel"),
    flightsTable: document.getElementById("flightsTable"),
    flightsMeta: document.getElementById("flightsMeta"),
    flightSearchInput: document.getElementById("flightSearchInput"),
    flightDetail: document.getElementById("flightDetail"),
    flightMapMessage: document.getElementById("flightMapMessage"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingMessage: document.getElementById("loadingMessage"),
    adminGate: document.getElementById("adminGate"),
    adminWorkspace: document.getElementById("adminWorkspace"),
    locationsSidebar: document.getElementById("locationsSidebar"),
    locationEditor: document.getElementById("locationEditor"),
    adminLocationTitle: document.getElementById("adminLocationTitle"),
    tourMatrix: document.getElementById("tourMatrix"),
    zoneInspector: document.getElementById("zoneInspector"),
    configEditor: document.getElementById("configEditor"),
    dashboardTab: document.getElementById("dashboardTab"),
    flightsTab: document.getElementById("flightsTab"),
    adminTab: document.getElementById("adminTab"),
    loadDemoBtn: document.getElementById("loadDemoBtn"),
    exportConfigBtn: document.getElementById("exportConfigBtn"),
    downloadSummaryBtn: document.getElementById("downloadSummaryBtn"),
    emailSummaryBtn: document.getElementById("emailSummaryBtn"),
    addLocationBtn: document.getElementById("addLocationBtn"),
    addZoneBtn: document.getElementById("addZoneBtn"),
    addTourBtn: document.getElementById("addTourBtn"),
    clearKmlBtn: document.getElementById("clearKmlBtn"),
    loadConfigToEditorBtn: document.getElementById("loadConfigToEditorBtn"),
    applyJsonBtn: document.getElementById("applyJsonBtn"),
  };

  const state = {
    config: loadStoredConfig(),
    csvText: "",
    headers: [],
    rowObjects: [],
    analysis: null,
    activeTab: APP_MODE === "admin" ? "admin" : "dashboard",
    selectedFlightId: "",
    selectedLocationId: "",
    selectedZoneId: "",
    selectedDashboardLocationId: "",
    selectedDashboardTourId: "",
    selectedDashboardRouteSet: "",
    flightSearchQuery: "",
    adminUnlocked: APP_MODE === "admin",
    configEditorDirty: false,
    kmlFeatures: [],
    weatherByFlightId: {},
    flightAnnotations: loadStoredFlightAnnotations(),
    loading: false,
    loadingMessage: "Loading...",
    lastSharedPublishedAt: "",
    pendingFlightDetailRefresh: false,
  };

  const maps = {
    editor: null,
    flight: null,
    drawnItems: null,
    kmlGroup: null,
    flightGroup: null,
    drawControl: null,
    resizeQueued: false,
    lastFlightBounds: null,
  };

  let loadingTimerId = 0;
  let loadingShowTimerId = 0;
  let sharedRefreshTimerId = 0;

  if (document.body) {
    document.body.classList.add("mode-" + APP_MODE);
  }

  function blank(value) {
    return value == null ? "" : String(value);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function loadStoredConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? core.sanitizeConfig(JSON.parse(stored)) : core.deepClone(core.DEFAULT_CONFIG);
    } catch (error) {
      return core.deepClone(core.DEFAULT_CONFIG);
    }
  }

  function openDatabase() {
    return new Promise(function openPromise(resolve, reject) {
      if (!globalObject.indexedDB) {
        resolve(null);
        return;
      }
      const request = globalObject.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function onUpgrade() {
        const database = request.result;
        if (!database.objectStoreNames.contains(DB_STORE)) {
          database.createObjectStore(DB_STORE);
        }
      };
      request.onsuccess = function onSuccess() {
        resolve(request.result);
      };
      request.onerror = function onError() {
        reject(request.error);
      };
    });
  }

  function loadIndexedConfig() {
    return openDatabase()
      .then(function withDatabase(database) {
        if (!database) {
          return null;
        }
        return new Promise(function loadPromise(resolve, reject) {
          const transaction = database.transaction(DB_STORE, "readonly");
          const store = transaction.objectStore(DB_STORE);
          const request = store.get(DB_CONFIG_KEY);
          request.onsuccess = function onSuccess() {
            resolve(request.result || null);
          };
          request.onerror = function onError() {
            reject(request.error);
          };
        });
      })
      .catch(function onError() {
        return null;
      });
  }

  function saveIndexedConfig(config) {
    return openDatabase()
      .then(function withDatabase(database) {
        if (!database) {
          return null;
        }
        return new Promise(function savePromise(resolve, reject) {
          const transaction = database.transaction(DB_STORE, "readwrite");
          const store = transaction.objectStore(DB_STORE);
          const request = store.put(config, DB_CONFIG_KEY);
          request.onsuccess = function onSuccess() {
            resolve(true);
          };
          request.onerror = function onError() {
            reject(request.error);
          };
        });
      })
      .catch(function onError() {
        return null;
      });
  }

  function saveConfigBackup(config, reason) {
    try {
      const serialized = JSON.stringify(core.sanitizeConfig(config));
      const existing = JSON.parse(localStorage.getItem(BACKUP_STORAGE_KEY) || "[]");
      if (existing[0] && existing[0].serialized === serialized) {
        return;
      }
      const next = [
        {
          savedAt: new Date().toISOString(),
          reason: reason || "autosave",
          serialized: serialized,
        },
      ].concat(Array.isArray(existing) ? existing : []).slice(0, MAX_CONFIG_BACKUPS);
      localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      return;
    }
  }

  function saveConfig() {
    saveConfigBackup(state.config, "autosave");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    saveIndexedConfig(state.config);
  }

  function loadSessionCsv() {
    try {
      return sessionStorage.getItem(CSV_SESSION_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function saveSessionCsv(csvText) {
    try {
      sessionStorage.setItem(CSV_SESSION_KEY, blank(csvText));
    } catch (error) {
      return;
    }
  }

  function loadPersistentCsv() {
    try {
      return localStorage.getItem(CSV_PERSIST_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function savePersistentCsv(csvText) {
    try {
      localStorage.setItem(CSV_PERSIST_KEY, blank(csvText));
    } catch (error) {
      return;
    }
  }

  function clearStoredCsv() {
    try {
      sessionStorage.removeItem(CSV_SESSION_KEY);
    } catch (error) {
      return;
    }
    try {
      localStorage.removeItem(CSV_PERSIST_KEY);
    } catch (error) {
      return;
    }
  }

  function sanitizeFlightAnnotations(source) {
    if (!source || typeof source !== "object") {
      return {};
    }
    return Object.keys(source).reduce(function collect(next, rawKey) {
      const key = blank(rawKey).trim();
      const entry = source[rawKey] || {};
      const reason = blank(entry.reason).trim();
      const note = blank(entry.note).trim();
      const updatedAt = blank(entry.updatedAt).trim();
      if (!key || (!reason && !note)) {
        return next;
      }
      next[key] = {
        reason: reason,
        note: note,
        updatedAt: updatedAt || new Date().toISOString(),
      };
      return next;
    }, {});
  }

  function loadStoredFlightAnnotations() {
    try {
      const stored = localStorage.getItem(FLIGHT_ANNOTATIONS_STORAGE_KEY);
      return stored ? sanitizeFlightAnnotations(JSON.parse(stored)) : {};
    } catch (error) {
      return {};
    }
  }

  function saveFlightAnnotations() {
    try {
      localStorage.setItem(
        FLIGHT_ANNOTATIONS_STORAGE_KEY,
        JSON.stringify(sanitizeFlightAnnotations(state.flightAnnotations))
      );
    } catch (error) {
      return;
    }
  }

  function publishedFlightAnnotations() {
    const sanitized = sanitizeFlightAnnotations(state.flightAnnotations);
    if (!state.analysis || !state.analysis.flights.length) {
      return sanitized;
    }
    const activeKeys = new Set(
      state.analysis.flights.map(function eachFlight(flight) {
        return blank(flight.stableKey).trim();
      })
    );
    return Object.keys(sanitized).reduce(function collect(next, key) {
      if (activeKeys.has(key)) {
        next[key] = sanitized[key];
      }
      return next;
    }, {});
  }

  function setStatus(type, message) {
    elements.statusBanner.hidden = false;
    elements.statusBanner.className = "status status--" + type;
    elements.statusBanner.textContent = message;
  }

  function clearStatus() {
    elements.statusBanner.hidden = true;
    elements.statusBanner.textContent = "";
    elements.statusBanner.className = "status";
  }

  function canUseServerApi() {
    return Boolean(globalObject.fetch && globalObject.location.protocol !== "file:");
  }

  function fetchJsonWithTimeout(url, options, timeoutMs) {
    if (!globalObject.fetch) {
      return Promise.reject(new Error("Fetch is not available."));
    }
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = globalObject.setTimeout(function onTimeout() {
      if (controller) {
        controller.abort();
      }
    }, timeoutMs || 8000);

    const requestOptions = Object.assign({}, options || {});
    if (controller) {
      requestOptions.signal = controller.signal;
    }

    return globalObject
      .fetch(url, requestOptions)
      .then(function onResponse(response) {
        return response.json().then(function onPayload(payload) {
          if (!response.ok) {
            throw new Error(payload.error || "Request failed.");
          }
          return payload;
        });
      })
      .finally(function onFinally() {
        globalObject.clearTimeout(timer);
      });
  }

  function renderLoadingOverlay() {
    if (!elements.loadingOverlay || !elements.loadingMessage) {
      return;
    }
    elements.loadingOverlay.hidden = !state.loading;
    elements.loadingMessage.textContent = state.loadingMessage || "Loading...";
  }

  function setLoading(active, message) {
    if (loadingShowTimerId) {
      globalObject.clearTimeout(loadingShowTimerId);
      loadingShowTimerId = 0;
    }
    if (loadingTimerId) {
      globalObject.clearTimeout(loadingTimerId);
      loadingTimerId = 0;
    }
    if (message) {
      state.loadingMessage = message;
    }
    if (!active) {
      state.loading = false;
      renderLoadingOverlay();
      return;
    }
    state.loading = false;
    renderLoadingOverlay();
    loadingShowTimerId = globalObject.setTimeout(function showLoadingIfStillActive() {
      state.loading = true;
      renderLoadingOverlay();
      loadingTimerId = globalObject.setTimeout(function autoHideLoading() {
        state.loading = false;
        renderLoadingOverlay();
        setStatus("success", "That task is still finishing in the background.");
      }, LOADING_AUTO_HIDE_MS);
    }, LOADING_SHOW_DELAY_MS);
  }

  function renderModeChrome() {
    const adminOnlyVisible = APP_MODE === "admin";
    document.querySelectorAll("[data-admin-only]").forEach(function eachElement(element) {
      element.hidden = !adminOnlyVisible;
    });
    if (!adminOnlyVisible && state.activeTab === "admin") {
      state.activeTab = "dashboard";
    }
  }

  function currentLocation() {
    return state.config.locations.find(function findLocation(location) {
      return location.id === state.selectedLocationId;
    }) || null;
  }

  function currentFlight() {
    if (!state.analysis) {
      return null;
    }
    return state.analysis.flights.find(function findFlight(flight) {
      return flight.id === state.selectedFlightId;
    }) || null;
  }

  function currentFlightAnnotation(flight) {
    if (!flight || !flight.stableKey) {
      return null;
    }
    return state.flightAnnotations[flight.stableKey] || null;
  }

  function flightWithinGoalBuffer(flight) {
    return Boolean(
      flight &&
        flight.assigned &&
        flight.bestEvaluation &&
        flight.durationMinutes <= flight.bestEvaluation.goalMinutes + GOAL_BUFFER_MINUTES
    );
  }

  function isEditingFlightAnnotation() {
    const active = document.activeElement;
    return Boolean(
      active &&
        (active.id === "flightReasonSelect" ||
          active.id === "flightReasonNote" ||
          active.closest("[data-flight-annotation-editor]"))
    );
  }

  function refreshSelectedFlightDetail(options) {
    const settings = options || {};
    const selected = currentFlight();
    if (!selected || state.activeTab !== "flights") {
      return;
    }
    if (settings.flightId && selected.id !== settings.flightId) {
      return;
    }
    if (!settings.force && isEditingFlightAnnotation()) {
      state.pendingFlightDetailRefresh = true;
      return;
    }
    state.pendingFlightDetailRefresh = false;
    renderFlightDetail();
    if (settings.includeMap) {
      renderFlightMap();
    }
  }

  function truncateText(value, maxLength) {
    const text = blank(value).trim();
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
  }

  function parseStationIdentifiers(value) {
    return blank(value)
      .split(/[,\s]+/)
      .map(function eachStation(station) {
        return blank(station).trim().toUpperCase();
      })
      .filter(Boolean)
      .slice(0, 8);
  }

  function parseRouteSetNames(value) {
    const source = Array.isArray(value) ? value : blank(value).split(",");
    const parsed = source
      .map(function eachRouteSet(routeSet) {
        return blank(routeSet).trim();
      })
      .filter(Boolean)
      .filter(function keepUnique(routeSet, routeSetIndex, list) {
        return list.indexOf(routeSet) === routeSetIndex;
      })
      .slice(0, 6);
    return parsed.length ? parsed : ["Standard"];
  }

  function seedMissingWeatherStations(config) {
    if (!config || !Array.isArray(config.locations)) {
      return;
    }
    config.locations.forEach(function eachLocation(location) {
      const current = Array.isArray(location.weatherStations) ? location.weatherStations.filter(Boolean) : [];
      if (current.length) {
        return;
      }
      const key = blank(location.name).trim().toLowerCase();
      if (LOCATION_STATION_DEFAULTS[key]) {
        location.weatherStations = LOCATION_STATION_DEFAULTS[key].slice();
      }
    });
  }

  function saveFlightAnnotationForSelectedFlight(reason, note) {
    const flight = currentFlight();
    if (!flight || !flight.stableKey) {
      return;
    }
    const nextReason = blank(reason).trim();
    const nextNote = blank(note).trim();
    if (!nextReason && !nextNote) {
      delete state.flightAnnotations[flight.stableKey];
      saveFlightAnnotations();
      render();
      setStatus("success", "Flight reason cleared.");
      return;
    }
    state.flightAnnotations[flight.stableKey] = {
      reason: nextReason,
      note: nextNote,
      updatedAt: new Date().toISOString(),
    };
    saveFlightAnnotations();
    render();
    setStatus(
      "success",
      "Flight reason saved. Publish Weekly View when you want everyone on the shared link to see it."
    );
  }

  function flightWeatherState(flightId) {
    return state.weatherByFlightId[flightId] || { status: "idle", data: null, error: "" };
  }

  function formatWeatherObserved(isoText) {
    if (!isoText) {
      return "Unknown";
    }
    const date = new Date(isoText);
    if (Number.isNaN(date.getTime())) {
      return isoText;
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  }

  function isWeatherOutOfRange(flight) {
    if (!flight || !flight.midpointAt) {
      return true;
    }
    return Date.now() - flight.midpointAt.getTime() > WEATHER_HISTORY_MS;
  }

  function weatherStationsForFlight(flight) {
    if (!flight) {
      return [];
    }
    const fallbackLocationId =
      flight.locationId || (flight.zoneHits && flight.zoneHits[0] ? flight.zoneHits[0].locationId : "");
    const location = state.config.locations.find(function findLocation(item) {
      return item.id === fallbackLocationId;
    });
    return location && Array.isArray(location.weatherStations)
      ? location.weatherStations.filter(Boolean).slice(0, 8)
      : [];
  }

  function loadSharedState() {
    if (!canUseServerApi()) {
      return Promise.resolve(null);
    }
    return fetchJsonWithTimeout("/api/shared-state", {}, 4000)
      .catch(function onError() {
        return null;
      });
  }

  function applySharedState(sharedState, options) {
    const settings = options || {};
    if (!sharedState) {
      return false;
    }

    const sharedPublishedAt = blank(sharedState.publishedAt).trim();
    const hasPublishedPayload = Boolean(sharedState.hasConfig || sharedState.hasCsv);
    const shouldApply =
      settings.force ||
      (hasPublishedPayload &&
        (sharedPublishedAt !== state.lastSharedPublishedAt ||
          (!state.csvText.trim() && blank(sharedState.csvText).trim())));

    state.lastSharedPublishedAt = sharedPublishedAt;

    if (!shouldApply) {
      return false;
    }

    if (sharedState.config) {
      state.config = core.sanitizeConfig(sharedState.config);
      seedMissingWeatherStations(state.config);
      saveConfig();
    }

    state.flightAnnotations = sanitizeFlightAnnotations(sharedState.flightAnnotations || {});
    saveFlightAnnotations();

    const sharedCsv = blank(sharedState.csvText);
    if (sharedCsv.trim()) {
      handleCsvText(sharedCsv);
      return true;
    }

    state.csvText = "";
    state.headers = [];
    state.rowObjects = [];
    state.analysis = null;
    state.selectedFlightId = "";
    state.flightSearchQuery = "";
    state.weatherByFlightId = {};
    clearStoredCsv();
    render();
    return true;
  }

  function startSharedStateRefresh() {
    if (sharedRefreshTimerId) {
      globalObject.clearInterval(sharedRefreshTimerId);
      sharedRefreshTimerId = 0;
    }
    if (APP_MODE !== "public" || !canUseServerApi()) {
      return;
    }
    sharedRefreshTimerId = globalObject.setInterval(function refreshSharedState() {
      loadSharedState().then(function onSharedState(sharedState) {
        applySharedState(sharedState);
      });
    }, SHARED_STATE_REFRESH_MS);
  }

  function publishSharedState() {
    if (!canUseServerApi()) {
      setStatus("error", "Publishing requires running the local Ruby server.");
      return;
    }
    if (!state.adminUnlocked) {
      state.activeTab = "admin";
      render();
      setStatus("error", "Unlock Admin Studio before publishing the weekly view.");
      return;
    }
    if (!state.csvText.trim()) {
      setStatus("error", "Upload a CSV before publishing the weekly view.");
      return;
    }

    clearStatus();
    setLoading(true, "Publishing weekly view for pilot access...");

    fetchJsonWithTimeout(
      "/api/shared-state",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: state.config,
          csvText: state.csvText,
          flightAnnotations: publishedFlightAnnotations(),
        }),
      },
      10000
    )
      .then(function onSuccess() {
        setStatus(
          "success",
          "Weekly view published. Anyone opening this server link will see the same CSV and config."
        );
      })
      .catch(function onError(error) {
        setStatus("error", error.message || "Could not publish the weekly view.");
      })
      .finally(function onFinally() {
        setLoading(false);
      });
  }

  function clearPublishedSheet() {
    if (!canUseServerApi() || !state.adminUnlocked) {
      return Promise.resolve(false);
    }
    return fetchJsonWithTimeout(
      "/api/shared-state",
      { method: "DELETE" },
      8000
    )
      .then(function onSuccess() {
        return true;
      })
      .catch(function onError() {
        return false;
      });
  }

  function loadWeatherForFlight(flight) {
    if (!flight || !flight.midLatitude || !flight.midLongitude || !flight.midpointAt) {
      return;
    }
    if (isWeatherOutOfRange(flight)) {
      state.weatherByFlightId[flight.id] = {
        status: "loaded",
        data: {
          requestedAt: flight.midpointAt.toISOString(),
          outsideRange: true,
          metar: null,
        },
        error: "",
      };
      refreshSelectedFlightDetail({ flightId: flight.id });
      return;
    }
    const current = flightWeatherState(flight.id);
    if (current.status === "loading" || current.status === "loaded") {
      return;
    }
    if (!globalObject.fetch || globalObject.location.protocol === "file:") {
      state.weatherByFlightId[flight.id] = {
        status: "error",
        data: null,
        error: "Weather requires running the app from the local Ruby server, not file://.",
      };
      refreshSelectedFlightDetail({ flightId: flight.id });
      return;
    }

    state.weatherByFlightId[flight.id] = { status: "loading", data: null, error: "" };

    globalObject.setTimeout(function weatherFailsafe() {
      const latest = flightWeatherState(flight.id);
      if (latest.status === "loading") {
        state.weatherByFlightId[flight.id] = {
          status: "error",
          data: null,
          error: "Weather lookup timed out.",
        };
        refreshSelectedFlightDetail({ flightId: flight.id });
      }
    }, WEATHER_LOADING_FAILSAFE_MS);

    const url =
      "/api/weather?lat=" +
      encodeURIComponent(String(flight.midLatitude)) +
      "&lon=" +
      encodeURIComponent(String(flight.midLongitude)) +
      "&time=" +
      encodeURIComponent(flight.midpointAt.toISOString()) +
      (weatherStationsForFlight(flight).length
        ? "&stations=" + encodeURIComponent(weatherStationsForFlight(flight).join(","))
        : "");

    fetchJsonWithTimeout(url, {}, WEATHER_REQUEST_TIMEOUT_MS)
      .then(function onPayload(payload) {
        state.weatherByFlightId[flight.id] = { status: "loaded", data: payload, error: "" };
        refreshSelectedFlightDetail({ flightId: flight.id });
      })
      .catch(function onError(error) {
        const message =
          error && (error.name === "AbortError" || /abort/i.test(blank(error.message)))
            ? "Weather lookup timed out."
            : "Weather unavailable right now.";
        state.weatherByFlightId[flight.id] = {
          status: "error",
          data: null,
          error: message,
        };
        refreshSelectedFlightDetail({ flightId: flight.id });
      });
  }

  function locationTours(locationId) {
    return state.config.tours.filter(function findTour(tour) {
      return tour.locationId === locationId;
    });
  }

  function initializeMaps() {
    if (!globalObject.L || maps.editor) {
      return;
    }

    maps.editor = L.map("editorMap", { zoomControl: true }).setView([39.5, -84], 5);
    maps.flight = L.map("flightMap", { zoomControl: true }).setView([39.5, -84], 5);

    const tileUrl =
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    const attribution = "Tiles © Esri";

    [maps.editor, maps.flight].forEach(function addTiles(mapInstance) {
      L.tileLayer(tileUrl, { attribution: attribution, maxZoom: 18 }).addTo(mapInstance);
    });

    maps.drawnItems = new L.FeatureGroup();
    maps.kmlGroup = new L.FeatureGroup();
    maps.flightGroup = new L.FeatureGroup();
    maps.editor.addLayer(maps.drawnItems);
    maps.editor.addLayer(maps.kmlGroup);
    maps.flight.addLayer(maps.flightGroup);

    maps.drawControl = new L.Control.Draw({
      edit: { featureGroup: maps.drawnItems, remove: true },
      draw: {
        polyline: false,
        polygon: false,
        circle: false,
        marker: false,
        circlemarker: false,
        rectangle: true,
      },
    });
    maps.editor.addControl(maps.drawControl);

    if (typeof ResizeObserver !== "undefined") {
      const editorContainer = document.getElementById("editorMap");
      const flightContainer = document.getElementById("flightMap");
      const observer = new ResizeObserver(function onResize() {
        refreshVisibleMaps();
      });
      if (editorContainer) {
        observer.observe(editorContainer);
      }
      if (flightContainer) {
        observer.observe(flightContainer);
      }
    }

    maps.editor.on(L.Draw.Event.CREATED, function onCreated(event) {
      if (!state.adminUnlocked) {
        return;
      }
      const location = currentLocation();
      if (!location) {
        setStatus("error", "Select a location before drawing zones.");
        return;
      }
      if (location.zones.length >= 10) {
        setStatus("error", "Each location is limited to 10 zones.");
        return;
      }
      const layer = event.layer;
      const bounds = layer.getBounds();
      const zone = {
        id: core.makeId("zone"),
        name: "Zone " + (location.zones.length + 1),
        color: location.color,
        box: {
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast(),
        },
      };
      updateLocation(location.id, function apply(locationToEdit) {
        locationToEdit.zones.push(zone);
      });
      state.selectedZoneId = zone.id;
      setStatus("success", "Zone added from the map.");
    });

    maps.editor.on(L.Draw.Event.EDITED, function onEdited(event) {
      const location = currentLocation();
      if (!location) {
        return;
      }
      const boundsByZoneId = new Map();
      event.layers.eachLayer(function eachLayer(layer) {
        const zoneId = layer.options.zoneId;
        if (!zoneId) {
          return;
        }
        const bounds = layer.getBounds();
        boundsByZoneId.set(zoneId, {
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast(),
        });
      });
      if (!boundsByZoneId.size) {
        return;
      }
      updateLocation(location.id, function apply(locationToEdit) {
        locationToEdit.zones = locationToEdit.zones.map(function eachZone(zone) {
          if (!boundsByZoneId.has(zone.id)) {
            return zone;
          }
          zone.box = boundsByZoneId.get(zone.id);
          return zone;
        });
      });
      setStatus("success", "Zone bounds updated.");
    });

    maps.editor.on(L.Draw.Event.DELETED, function onDeleted(event) {
      const zoneIds = [];
      event.layers.eachLayer(function eachLayer(layer) {
        if (layer.options.zoneId) {
          zoneIds.push(layer.options.zoneId);
        }
      });
      if (!zoneIds.length) {
        return;
      }
      removeZones(zoneIds);
      setStatus("success", "Zone removed.");
    });
  }

  function queueMapResize() {
    if (maps.resizeQueued) {
      return;
    }
    maps.resizeQueued = true;
    globalObject.requestAnimationFrame(function onFrame() {
      globalObject.setTimeout(function onTimeout() {
        maps.resizeQueued = false;
        refreshVisibleMaps();
      }, 40);
    });
  }

  function refreshVisibleMaps() {
    if (maps.editor && state.activeTab === "admin") {
      maps.editor.invalidateSize(true);
    }
    if (maps.flight && state.activeTab === "flights") {
      maps.flight.invalidateSize(true);
      if (maps.lastFlightBounds) {
        scheduleFlightMapFit(maps.lastFlightBounds);
      }
    }
  }

  function scheduleFlightMapFit(bounds) {
    if (!maps.flight || !bounds || !bounds.isValid()) {
      return;
    }
    maps.lastFlightBounds = bounds;
    [0, 80, 220].forEach(function eachDelay(delay) {
      globalObject.setTimeout(function fitFlightBounds() {
        if (!maps.flight || !maps.lastFlightBounds || state.activeTab !== "flights") {
          return;
        }
        maps.flight.invalidateSize(true);
        maps.flight.fitBounds(maps.lastFlightBounds.pad(0.18), { animate: false });
      }, delay);
    });
  }

  function fitEditorToUsefulBounds() {
    if (!maps.editor) {
      return;
    }
    const location = currentLocation();
    if (!location) {
      maps.editor.setView([39.5, -98.35], 4);
      return;
    }

    const zoneBounds = [];
    location.zones.forEach(function eachZone(zone) {
      zoneBounds.push(
        L.latLngBounds(
          [zone.box.minLat, zone.box.minLng],
          [zone.box.maxLat, zone.box.maxLng]
        )
      );
    });

    if (zoneBounds.length) {
      const combined = zoneBounds[0];
      for (let index = 1; index < zoneBounds.length; index += 1) {
        combined.extend(zoneBounds[index]);
      }
      maps.editor.fitBounds(combined.pad(0.35));
      return;
    }

    if (maps.kmlGroup && maps.kmlGroup.getLayers().length) {
      maps.editor.fitBounds(maps.kmlGroup.getBounds().pad(0.2));
      return;
    }

    maps.editor.setView([39.5, -98.35], 4);
  }

  function updateLocation(locationId, callback) {
    state.config.locations = state.config.locations.map(function eachLocation(location) {
      if (location.id !== locationId) {
        return location;
      }
      const clone = core.deepClone(location);
      callback(clone);
      return clone;
    });
    state.config = core.sanitizeConfig(state.config);
    saveConfig();
    syncAnalysis();
  }

  function updateTour(tourId, callback) {
    state.config.tours = state.config.tours.map(function eachTour(tour) {
      if (tour.id !== tourId) {
        return tour;
      }
      const clone = core.deepClone(tour);
      callback(clone);
      return clone;
    });
    state.config = core.sanitizeConfig(state.config);
    saveConfig();
    syncAnalysis();
  }

  function removeZones(zoneIds) {
    const ids = new Set(zoneIds);
    const location = currentLocation();
    if (!location) {
      return;
    }
    updateLocation(location.id, function apply(locationToEdit) {
      locationToEdit.zones = locationToEdit.zones.filter(function keepZone(zone) {
        return !ids.has(zone.id);
      });
    });
    state.config.tours = state.config.tours.map(function scrubTour(tour) {
      if (tour.locationId !== location.id) {
        return tour;
      }
      tour.zoneIds = tour.zoneIds.filter(function keepZoneId(zoneId) {
        return !ids.has(zoneId);
      });
      return tour;
    });
    state.selectedZoneId = "";
    state.config = core.sanitizeConfig(state.config);
    saveConfig();
    syncAnalysis();
  }

  function handleCsvText(csvText) {
    state.csvText = csvText;
    saveSessionCsv(csvText);
    savePersistentCsv(csvText);
    const parsed = core.parseCsv(csvText);
    state.headers = parsed.headers;
    const inferred = core.inferMapping(parsed.headers);
    ["tailNumber", "timestamp", "latitude", "longitude", "altitude", "description", "trackId"].forEach(
      function apply(key) {
        const current = state.config.csvSettings[key];
        if (!current || state.headers.indexOf(current) === -1) {
          state.config.csvSettings[key] = inferred[key] || current || "";
        }
      }
    );
    state.rowObjects = core.rowsToObjects(parsed.headers, parsed.rows);
    syncAnalysis();
  }

  function clearCurrentSheet() {
    clearStoredCsv();
    setLoading(true, "Clearing uploaded sheet...");
    clearPublishedSheet()
      .then(function onPublishedClear(clearedPublished) {
        state.csvText = "";
        state.headers = [];
        state.rowObjects = [];
        state.analysis = null;
        state.selectedFlightId = "";
        state.flightSearchQuery = "";
        state.weatherByFlightId = {};
        state.flightAnnotations = {};
        saveFlightAnnotations();
        render();
        setStatus(
          "success",
          clearedPublished
            ? "Uploaded sheet cleared here and from the published weekly view."
            : "Uploaded sheet cleared. Your tours and zones are still saved."
        );
      })
      .finally(function onFinally() {
        setLoading(false);
      });
  }

  function syncAnalysis() {
    state.config = core.sanitizeConfig(state.config);
    seedMissingWeatherStations(state.config);
    saveConfig();

    if (!state.selectedLocationId && state.config.locations[0]) {
      state.selectedLocationId = state.config.locations[0].id;
    }
    if (!state.selectedDashboardLocationId && state.config.locations[0]) {
      state.selectedDashboardLocationId = state.config.locations[0].id;
    }

    if (!state.csvText.trim()) {
      state.analysis = null;
      render();
      return;
    }

    state.analysis = core.analyzeRows(state.rowObjects, state.config);
    if (!state.selectedFlightId && state.analysis.flights[0]) {
      state.selectedFlightId = state.analysis.flights[0].id;
    }
    if (
      state.selectedFlightId &&
      !state.analysis.flights.some(function hasFlight(flight) {
        return flight.id === state.selectedFlightId;
      })
    ) {
      state.selectedFlightId = state.analysis.flights[0] ? state.analysis.flights[0].id : "";
    }
    render();
  }

  function render() {
    renderModeChrome();
    renderTabs();
    renderCsvMeta();
    renderMapping();

    if (state.activeTab === "dashboard") {
      renderSummaryCards();
      renderDashboard();
      renderDashboardDetail();
    }

    if (state.activeTab === "flights") {
      renderFlights();
      loadWeatherForFlight(currentFlight());
      renderFlightDetail();
      renderFlightMap();
    }

    if (state.activeTab === "admin") {
      renderAdmin();
      renderConfigEditor(false);
      renderEditorMap();
    }

    queueMapResize();
    renderLoadingOverlay();
  }

  function renderTabs() {
    document.querySelectorAll(".tab-button").forEach(function eachButton(button) {
      button.classList.toggle("is-active", button.getAttribute("data-tab") === state.activeTab);
    });
    document.querySelectorAll(".tab-panel").forEach(function eachPanel(panel) {
      panel.classList.toggle("is-active", panel.id === state.activeTab + "Tab");
    });
    elements.dateRangeLabel.textContent =
      state.analysis && state.analysis.summary.start && state.analysis.summary.end
        ? core.formatDateRange(state.analysis.summary.start, state.analysis.summary.end)
        : "";
  }

  function renderCsvMeta() {
    if (!state.csvText.trim()) {
      elements.csvMeta.innerHTML = "<span class='pill pill--muted'>No CSV loaded</span>";
      if (elements.adminCsvMeta) {
        elements.adminCsvMeta.innerHTML = "<span class='pill pill--muted'>No CSV loaded</span>";
      }
      return;
    }
    const analysis = state.analysis;
    const markup =
      "<span class='pill'>" +
      escapeHtml(String(state.rowObjects.length)) +
      " rows</span>" +
      "<span class='pill'>" +
      escapeHtml(String(analysis ? analysis.flights.length : 0)) +
      " flights</span>" +
      "<span class='pill'>" +
      escapeHtml(String(analysis ? analysis.skippedRows : 0)) +
      " skipped</span>";
    elements.csvMeta.innerHTML = markup;
    if (elements.adminCsvMeta) {
      elements.adminCsvMeta.innerHTML = markup;
    }
  }

  function renderMapping() {
    if (!state.headers.length) {
      elements.mappingPanel.innerHTML =
        "<div class='empty-state'>Upload a CSV and the Spidertracks columns will map here.</div>";
      return;
    }

    function options(currentValue) {
      return (
        "<option value=''>Choose column</option>" +
        state.headers
          .map(function eachHeader(header) {
            return (
              "<option value='" +
              escapeHtml(header) +
              "'" +
              (header === currentValue ? " selected" : "") +
              ">" +
              escapeHtml(header) +
              "</option>"
            );
          })
          .join("")
      );
    }

    const settings = state.config.csvSettings;
    elements.mappingPanel.innerHTML =
      renderSelectField("Tail number", "tailNumber", options(settings.tailNumber)) +
      renderSelectField("Local timestamp", "timestamp", options(settings.timestamp)) +
      renderSelectField("Latitude", "latitude", options(settings.latitude)) +
      renderSelectField("Longitude", "longitude", options(settings.longitude)) +
      renderSelectField("Altitude", "altitude", options(settings.altitude)) +
      renderSelectField("Description", "description", options(settings.description)) +
      renderSelectField("Track ID", "trackId", options(settings.trackId)) +
      "<label class='field'><span>Date order fallback</span><select data-mapping='dateOrder'>" +
      ["auto", "DMY", "MDY", "YMD"]
        .map(function eachValue(value) {
          return (
            "<option value='" +
            value +
            "'" +
            (value === settings.dateOrder ? " selected" : "") +
            ">" +
            value +
            "</option>"
          );
        })
        .join("") +
      "</select></label>";
  }

  function renderSelectField(label, key, optionsMarkup) {
    return (
      "<label class='field'><span>" +
      escapeHtml(label) +
      "</span><select data-mapping='" +
      escapeHtml(key) +
      "'>" +
      optionsMarkup +
      "</select></label>"
    );
  }

  function renderSummaryCards() {
    if (!state.analysis) {
      elements.summaryCards.innerHTML =
        "<div class='empty-state'>Load a CSV to see flight counts and averages.</div>";
      return;
    }
    const summary = state.analysis.summary;
    elements.summaryCards.innerHTML =
      renderSummaryCard("Flights", summary.totalFlights) +
      renderSummaryCard("Matched Tours", summary.matchedFlights) +
      renderSummaryCard("Unmatched", summary.unmatchedFlights) +
      renderSummaryCard("Avg Matched", core.formatDuration(summary.avgMatchedMinutes)) +
      renderSummaryCard("Locations", summary.byLocation.length);
  }

  function renderSummaryCard(label, value) {
    return (
      "<div class='summary-card'><p>" +
      escapeHtml(label) +
      "</p><strong>" +
      escapeHtml(String(value)) +
      "</strong></div>"
    );
  }

  function routeSetsForLocationSummary(locationSummary) {
    if (!locationSummary) {
      return [];
    }
    const configured = Array.isArray(locationSummary.routeSets)
      ? locationSummary.routeSets.filter(Boolean)
      : [];
    const fromRows = locationSummary.rows
      .map(function eachRow(row) {
        return blank(row.routeSet).trim();
      })
      .filter(Boolean);
    const ordered = configured.concat(fromRows).filter(function keepUnique(routeSet, index, list) {
      return list.indexOf(routeSet) === index;
    });
    return ordered.length ? ordered : ["Standard"];
  }

  function renderDashboardLocationRows(location) {
    const routeSets = routeSetsForLocationSummary(location);
    const showSections = routeSets.length > 1;
    return routeSets
      .map(function eachRouteSet(routeSet) {
        const rows = location.rows.filter(function matchesRouteSet(row) {
          return blank(row.routeSet).trim() === routeSet;
        });
        if (!rows.length) {
          return "";
        }
        return (
          (showSections
            ? "<tr class='mini-table__section'><td colspan='5'>" + escapeHtml(routeSet) + "</td></tr>"
            : "") +
          rows
            .map(function eachRow(row) {
              return (
                "<tr data-dashboard-location='" +
                escapeHtml(location.locationId) +
                "' data-dashboard-tour='" +
                escapeHtml(row.tourId) +
                "' data-dashboard-route-set='" +
                escapeHtml(routeSet) +
                "'" +
                (row.tourId === state.selectedDashboardTourId &&
                location.locationId === state.selectedDashboardLocationId
                  ? " class='is-selected'"
                  : "") +
                "><td>" +
                escapeHtml(row.name) +
                "</td><td>" +
                escapeHtml(core.formatDuration(row.goalMinutes)) +
                "</td><td class='value-cell--" +
                row.tone +
                "'>" +
                escapeHtml(row.avgMinutes == null ? "No Data" : core.formatDuration(row.avgMinutes)) +
                "</td><td class='value-cell--" +
                row.tone +
                "'>" +
                escapeHtml(row.diffMinutes == null ? "No Data" : core.formatDuration(row.diffMinutes)) +
                "</td><td>" +
                escapeHtml(String(row.count)) +
                "</td></tr>"
              );
            })
            .join("")
        );
      })
      .join("");
  }

  function renderDashboard() {
    if (!state.analysis) {
      elements.dashboardCards.innerHTML =
        "<div class='empty-state'>The location dashboard appears after a CSV is loaded.</div>";
      return;
    }

    if (
      !state.analysis.summary.byLocation.some(function hasLocation(location) {
        return location.locationId === state.selectedDashboardLocationId;
      })
    ) {
      state.selectedDashboardLocationId = state.analysis.summary.byLocation[0]
        ? state.analysis.summary.byLocation[0].locationId
        : "";
      state.selectedDashboardTourId = "";
      state.selectedDashboardRouteSet = "";
    }

    const selectedLocationSummary = state.analysis.summary.byLocation.find(function findLocation(location) {
      return location.locationId === state.selectedDashboardLocationId;
    });
    if (
      state.selectedDashboardRouteSet &&
      routeSetsForLocationSummary(selectedLocationSummary).indexOf(state.selectedDashboardRouteSet) === -1
    ) {
      state.selectedDashboardRouteSet = "";
    }

    elements.dashboardCards.innerHTML = state.analysis.summary.byLocation
      .map(function eachLocation(location) {
        return (
          "<article class='location-card" +
          (location.locationId === state.selectedDashboardLocationId ? " is-selected" : "") +
          "' data-dashboard-location='" +
          escapeHtml(location.locationId) +
          "'>" +
          "<div class='location-card__head' style='background:" +
          escapeHtml(location.color) +
          "'><h3>" +
          escapeHtml(location.name) +
          "</h3><div class='location-card__meta'>" +
          escapeHtml(String(location.totalFlights)) +
          "</div></div>" +
          "<table class='mini-table'><thead><tr><th>Tours</th><th>Time Goal</th><th>Actual</th><th>Difference</th><th>#</th></tr></thead><tbody>" +
          renderDashboardLocationRows(location) +
          "</tbody><tfoot><tr><td>Total</td><td></td><td>" +
          escapeHtml(
            location.avgLoadMinutes == null ? "No Data" : core.formatDuration(location.avgLoadMinutes)
          ) +
          "</td><td></td><td>" +
          escapeHtml(String(location.totalFlights)) +
          "</td></tr></tfoot></table></article>"
        );
      })
      .join("");
  }

  function renderDashboardDetail() {
    if (!state.analysis) {
      elements.dashboardDetail.innerHTML =
        "<div class='empty-state'>Load a CSV to review good and bad flights by location.</div>";
      return;
    }

    const locationSummary = state.analysis.summary.byLocation.find(function findLocation(location) {
      return location.locationId === state.selectedDashboardLocationId;
    });

    if (!locationSummary) {
      elements.dashboardDetail.innerHTML =
        "<div class='empty-state'>Select a location card to inspect its flights.</div>";
      return;
    }

    const routeSets = routeSetsForLocationSummary(locationSummary);
    if (state.selectedDashboardRouteSet && routeSets.indexOf(state.selectedDashboardRouteSet) === -1) {
      state.selectedDashboardRouteSet = "";
    }
    if (
      state.selectedDashboardTourId &&
      !locationSummary.rows.some(function hasTour(row) {
        return (
          row.tourId === state.selectedDashboardTourId &&
          (!state.selectedDashboardRouteSet ||
            blank(row.routeSet).trim() === state.selectedDashboardRouteSet)
        );
      })
    ) {
      state.selectedDashboardTourId = "";
    }

    const flights = state.analysis.flights.filter(function filterFlight(flight) {
      if (flight.locationId !== locationSummary.locationId) {
        return false;
      }
      if (!flightMatchesSelectedRouteSet(flight)) {
        return false;
      }
      if (!state.selectedDashboardTourId) {
        return true;
      }
      return flight.bestEvaluation && flight.bestEvaluation.tourId === state.selectedDashboardTourId;
    });

    const goodFlights = flights.filter(function isGood(flight) {
      return flightWithinGoalBuffer(flight);
    });
    const badFlights = flights.filter(function isBad(flight) {
      return !flight.assigned || !flightWithinGoalBuffer(flight);
    });
    const operationalFlights = state.analysis.flights.filter(function filterOperationalFlight(flight) {
      if (!currentFlightAnnotation(flight)) {
        return false;
      }
      if (!flightTouchesLocation(flight, locationSummary.locationId)) {
        return false;
      }
      if (!flightMatchesSelectedRouteSet(flight)) {
        return false;
      }
      if (!state.selectedDashboardTourId) {
        return true;
      }
      return !flight.bestEvaluation || flight.bestEvaluation.tourId === state.selectedDashboardTourId;
    });

    const tourButtons = locationSummary.rows
      .filter(function filterByRouteSet(row) {
        if (!state.selectedDashboardRouteSet) {
          return true;
        }
        return blank(row.routeSet).trim() === state.selectedDashboardRouteSet;
      })
      .map(function eachRow(row) {
        const isActive = row.tourId === state.selectedDashboardTourId;
        return (
          "<button class='tour-pill" +
          (isActive ? " is-active" : "") +
          "' data-dashboard-location='" +
          escapeHtml(locationSummary.locationId) +
          "' data-dashboard-tour='" +
          escapeHtml(row.tourId) +
          "' data-dashboard-route-set='" +
          escapeHtml(blank(row.routeSet).trim()) +
          "'>" +
          escapeHtml(row.name) +
          " <span>" +
          escapeHtml(String(row.count)) +
          "</span></button>"
        );
      })
      .join("");

    const routeSetButtons = routeSets.length > 1
      ? "<div class='route-set-pill-row'><button class='tour-pill" +
        (state.selectedDashboardRouteSet ? "" : " is-active") +
        "' data-dashboard-location='" +
        escapeHtml(locationSummary.locationId) +
        "' data-dashboard-route-set=''>All Route Sets</button>" +
        routeSets
          .map(function eachRouteSet(routeSet) {
            return (
              "<button class='tour-pill" +
              (routeSet === state.selectedDashboardRouteSet ? " is-active" : "") +
              "' data-dashboard-location='" +
              escapeHtml(locationSummary.locationId) +
              "' data-dashboard-route-set='" +
              escapeHtml(routeSet) +
              "'>" +
              escapeHtml(routeSet) +
              "</button>"
            );
          })
          .join("") +
        "</div>"
      : "";

    elements.dashboardDetail.innerHTML =
      "<div class='dashboard-detail-stack'><div class='detail-card detail-card--filters'><div class='panel__header'><div><h3>" +
      escapeHtml(locationSummary.name) +
      "</h3><p class='muted'>Click a tour to filter the flights listed for this location.</p></div><div class='card-header__meta'><span class='pill pill--good'>" +
      escapeHtml(String(goodFlights.length)) +
      " good</span><span class='pill pill--bad'>" +
      escapeHtml(String(badFlights.length)) +
      " bad</span><span class='pill pill--annotation'>" +
      escapeHtml(String(operationalFlights.length)) +
      " operational</span></div></div>" +
      routeSetButtons +
      "<div class='tour-pill-row'><button class='tour-pill" +
      (state.selectedDashboardTourId ? "" : " is-active") +
      "' data-dashboard-location='" +
      escapeHtml(locationSummary.locationId) +
      "' data-dashboard-tour='' data-dashboard-route-set='" +
      escapeHtml(state.selectedDashboardRouteSet) +
      "'>All Tours</button>" +
      tourButtons +
      "</div></div><div class='dashboard-detail-grid'><div class='detail-card'><div class='panel__header'><div><h3>Good Flights</h3></div></div>" +
      renderDashboardFlightList(goodFlights, "No good flights matched this filter.") +
      "</div><div class='detail-card'><div class='panel__header'><div><h3>Needs Review</h3></div></div>" +
      renderDashboardFlightList(badFlights, "No flights need review for this filter.") +
      "</div><div class='detail-card'><div class='panel__header'><div><h3>Operational Notes</h3><p class='muted'>Ferry, training, photo, maintenance, and other annotated flights.</p></div></div>" +
      renderDashboardFlightList(
        operationalFlights,
        "No annotated operational flights are attached to this location yet."
      ) +
      "</div></div></div>";
  }

  function renderDashboardFlightList(flights, emptyMessage) {
    if (!flights.length) {
      return "<div class='empty-state'>" + escapeHtml(emptyMessage) + "</div>";
    }
    return (
      "<div class='table-wrap'><table class='table dashboard-flight-table'><thead><tr><th>Tail</th><th>Tour</th><th>Actual</th><th>Goal</th><th>Status</th><th>Reason</th><th>Zones</th></tr></thead><tbody>" +
      flights
        .slice()
        .sort(function byTime(left, right) {
          return left.takeoffAt.getTime() - right.takeoffAt.getTime();
        })
        .map(function eachFlight(flight) {
          return (
            "<tr data-flight-id='" +
            escapeHtml(flight.id) +
            "'><td>" +
            escapeHtml(flight.tailNumber) +
            "</td><td>" +
            renderMatchedTourCell(flight) +
            "</td><td>" +
            escapeHtml(flight.durationLabel) +
            "</td><td>" +
            escapeHtml(
              flight.bestEvaluation ? core.formatDuration(flight.bestEvaluation.goalMinutes) : "—"
            ) +
            "</td><td>" +
            flightStatusPill(flight) +
            "</td><td>" +
            renderFlightReasonCell(flight) +
            "</td><td>" +
            escapeHtml(flight.zoneHitNames.join(", ") || "—") +
            "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function flightStatusPill(flight) {
    if (!flight.bestEvaluation) {
      return "<span class='pill pill--muted'>Unassigned</span>";
    }
    if (flightWithinGoalBuffer(flight)) {
      return "<span class='pill pill--good'>On Plan</span>";
    }
    if (flight.assigned) {
      return "<span class='pill pill--bad'>Overflown</span>";
    }
    if (flight.bestEvaluation.allZonesHit) {
      return "<span class='pill pill--warn'>Outside Duration</span>";
    }
    return "<span class='pill pill--muted'>Unassigned</span>";
  }

  function renderFlightReasonPill(annotation) {
    if (!annotation || !blank(annotation.reason).trim()) {
      return "";
    }
    return (
      "<span class='pill pill--annotation'>" + escapeHtml(blank(annotation.reason).trim()) + "</span>"
    );
  }

  function renderMatchedTourCell(flight) {
    const evaluation = flight.bestEvaluation;
    const tourName = evaluation && evaluation.assigned ? evaluation.tourName : "No match";
    const routeSet =
      evaluation && evaluation.assigned && blank(evaluation.routeSet).trim()
        ? "<span class='pill pill--tag'>" + escapeHtml(blank(evaluation.routeSet).trim()) + "</span>"
        : "";
    return "<div class='matched-tour-cell'><span>" + escapeHtml(tourName) + "</span>" + routeSet + "</div>";
  }

  function renderFlightReasonCell(flight) {
    const annotation = currentFlightAnnotation(flight);
    if (!annotation) {
      return "<span class='muted'>—</span>";
    }
    const summary = truncateText(annotation.note, 52);
    return (
      "<div class='flight-reason-cell'>" +
      renderFlightReasonPill(annotation) +
      (summary ? "<span class='flight-reason-cell__note'>" + escapeHtml(summary) + "</span>" : "") +
      "</div>"
    );
  }

  function renderFlights() {
    if (!state.analysis) {
      elements.flightsTable.innerHTML = "";
      elements.flightsMeta.innerHTML = "<span class='pill pill--muted'>No flights yet</span>";
      if (elements.flightSearchInput) {
        elements.flightSearchInput.value = state.flightSearchQuery;
      }
      return;
    }

    if (elements.flightSearchInput && elements.flightSearchInput.value !== state.flightSearchQuery) {
      elements.flightSearchInput.value = state.flightSearchQuery;
    }

    const filteredFlights = state.analysis.flights.filter(function eachFlight(flight) {
      return matchesFlightSearch(flight, state.flightSearchQuery);
    });

    if (
      filteredFlights.length &&
      !filteredFlights.some(function hasFlight(flight) { return flight.id === state.selectedFlightId; })
    ) {
      state.selectedFlightId = filteredFlights[0].id;
    } else if (!filteredFlights.length) {
      state.selectedFlightId = "";
    }

    elements.flightsMeta.innerHTML =
      "<span class='pill'>" +
      escapeHtml(String(filteredFlights.length)) +
      (filteredFlights.length === state.analysis.summary.totalFlights
        ? " segmented flights"
        : " shown") +
      "</span>" +
      (filteredFlights.length === state.analysis.summary.totalFlights
        ? ""
        : "<span class='pill pill--muted'>of " +
          escapeHtml(String(state.analysis.summary.totalFlights)) +
          " total</span>");

    if (!filteredFlights.length) {
      elements.flightsTable.innerHTML =
        "<tr class='table-empty-row'><td colspan='9'>No flights match your search.</td></tr>";
      return;
    }

    elements.flightsTable.innerHTML = filteredFlights
      .map(function eachFlight(flight) {
        return (
          "<tr data-flight-id='" +
          escapeHtml(flight.id) +
          "'" +
          (flight.id === state.selectedFlightId ? " class='is-selected'" : "") +
          "><td>" +
          escapeHtml(flight.tailNumber) +
          "</td><td>" +
          escapeHtml(flight.takeoffLabel) +
          "</td><td>" +
          escapeHtml(flight.landingLabel || "") +
          "</td><td>" +
          escapeHtml(flight.durationLabel) +
          "</td><td>" +
          escapeHtml(flight.locationName) +
          "</td><td>" +
          renderMatchedTourCell(flight) +
          "</td><td>" +
          flightStatusPill(flight) +
          "</td><td>" +
          renderFlightReasonCell(flight) +
          "</td><td>" +
          escapeHtml(flight.zoneHitNames.join(", ") || "—") +
          "</td></tr>"
        );
      })
      .join("");
  }

  function matchesFlightSearch(flight, query) {
    const needle = blank(query).trim().toLowerCase();
    if (!needle) {
      return true;
    }
    const haystack = [
      flight.tailNumber,
      flight.takeoffLabel,
      flight.landingLabel,
      flight.durationLabel,
      flight.locationName,
      flight.bestEvaluation ? flight.bestEvaluation.tourName : "No match",
      flight.bestEvaluation ? flight.bestEvaluation.routeSet : "",
      currentFlightAnnotation(flight) ? currentFlightAnnotation(flight).reason : "",
      currentFlightAnnotation(flight) ? currentFlightAnnotation(flight).note : "",
      flight.status,
      flight.trackId,
      flight.zoneHitNames.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  }

  function renderFlightDetail() {
    const flight = currentFlight();
    if (!flight) {
      elements.flightDetail.innerHTML =
        "<div class='empty-state'>Select a flight to see its tour match details.</div>";
      return;
    }

    const weather = flightWeatherState(flight.id);
    const annotation = currentFlightAnnotation(flight);

    const top =
      "<div class='detail-card'><div class='panel__header'><div><h3>" +
      escapeHtml(flight.tailNumber) +
      "</h3><p class='muted'>" +
      escapeHtml(flight.takeoffLabel + " to " + (flight.landingLabel || "")) +
      "</p></div><div class='card-header__meta'><span class='pill'>" +
      escapeHtml(flight.durationLabel) +
      "</span>" +
      renderFlightAltitudePill(flight) +
      renderFlightReasonPill(annotation) +
      flightStatusPill(flight) +
      "</div></div><div>" +
      flight.zoneHits
        .map(function eachHit(hit) {
          return (
            "<span class='zone-chip'><span class='dot' style='background:" +
            escapeHtml(
              (state.config.locations.find(function findLocation(location) {
                return location.id === hit.locationId;
              }) || { color: "#666" }).color
            ) +
            "'></span>" +
            escapeHtml(hit.locationName + " / " + hit.zoneName) +
            "</span>"
          );
        })
        .join("") +
      "</div></div>";

    const evaluationCards = flight.evaluations
      .slice()
      .sort(function byAssigned(left, right) {
        if (left.assigned !== right.assigned) {
          return left.assigned ? -1 : 1;
        }
        return right.matchScore - left.matchScore;
      })
      .map(function eachEvaluation(evaluation) {
        return (
          "<div class='detail-card'><h3>" +
          escapeHtml(evaluation.locationName + " / " + evaluation.tourName) +
          "</h3><p class='muted'>Zones hit: " +
          escapeHtml(
            evaluation.matchedZones.length + " / " + evaluation.requiredZoneIds.length
          ) +
          " | Window: " +
          escapeHtml(
            core.formatDuration(evaluation.minMinutes) +
              " to " +
              core.formatDuration(evaluation.maxMinutes)
          ) +
          " | Goal: " +
          escapeHtml(core.formatDuration(evaluation.goalMinutes)) +
          "</p><div class='card-header__meta'>" +
          (evaluation.assigned
            ? "<span class='pill pill--good'>Matched</span>"
            : evaluation.allZonesHit
              ? "<span class='pill pill--warn'>Zone match but duration out of range</span>"
              : "<span class='pill pill--muted'>Did not qualify</span>") +
          "<span class='pill'>" +
          escapeHtml(core.formatDuration(evaluation.diffFromGoal)) +
          "</span></div></div>"
        );
      })
      .join("");

    const annotationMarkup = renderFlightAnnotationCard(flight, annotation);
    const weatherMarkup = renderWeatherCard(weather, { compact: false });

    elements.flightDetail.innerHTML = top + annotationMarkup + weatherMarkup + evaluationCards;
  }

  function renderFlightAnnotationCard(flight, annotation) {
    const currentReason = annotation ? blank(annotation.reason).trim() : "";
    const currentNote = annotation ? blank(annotation.note) : "";
    const readOnlySummary = currentReason || currentNote
      ? "<div class='flight-annotation-summary'>" +
        (currentReason ? renderFlightReasonPill(annotation) : "") +
        (currentNote
          ? "<p class='flight-annotation-summary__note'>" + escapeHtml(currentNote) + "</p>"
          : "") +
        "</div>"
      : "<p class='muted'>No exception reason has been saved for this flight.</p>";

    if (!state.adminUnlocked) {
      return (
        "<div class='detail-card'><div class='panel__header'><div><h3>Flight Reason</h3><p class='muted'>Use this for outliers like photo flights, maintenance, training, or ferry legs.</p></div></div>" +
        readOnlySummary +
        "<p class='muted'>Open the secure admin link if you need to edit this flight reason.</p></div>"
      );
    }

    return (
      "<div class='detail-card'><div class='panel__header'><div><h3>Flight Reason</h3><p class='muted'>Mark outliers here so viewers can see why a flight ran long.</p></div></div>" +
      "<div class='flight-annotation-editor' data-flight-annotation-editor='" +
      escapeHtml(flight.stableKey || "") +
      "'>" +
      "<label class='field'><span>Reason</span><input id='flightReasonSelect' type='text' list='flightReasonOptions' placeholder='Photo Flight, Maintenance, Training...' value='" +
      escapeHtml(currentReason) +
      "' /><datalist id='flightReasonOptions'>" +
      FLIGHT_REASON_OPTIONS.map(function eachReason(reason) {
        return "<option value='" + escapeHtml(reason) + "'></option>";
      }).join("") +
      "</datalist></label>" +
      "<label class='field'><span>Note</span><textarea id='flightReasonNote' rows='3' placeholder='Optional details for management or pilot review.'>" +
      escapeHtml(currentNote) +
      "</textarea></label>" +
      "<div class='button-row'><button id='saveFlightAnnotationBtn' class='button button--small'>Save Flight Reason</button><button id='clearFlightAnnotationBtn' class='button button--ghost button--small'>Clear Reason</button></div>" +
      "</div></div>"
    );
  }

  function renderWeatherCard(weather, options) {
    const compact = options && options.compact;
    const wrapperClass = compact ? "map-overlay-card__inner" : "detail-card";
    const gridClass = compact ? "weather-grid weather-grid--compact" : "weather-grid";

    if (weather.status === "loading") {
      return (
        "<div class='" +
        wrapperClass +
        "'><h3>Flight Weather</h3><p class='muted'>Checking the nearest METAR...</p></div>"
      );
    }
    if (weather.status === "error") {
      return (
        "<div class='" +
        wrapperClass +
        "'><h3>Flight Weather</h3><p class='muted'>" +
        escapeHtml(weather.error) +
        "</p></div>"
      );
    }
    if (weather.status === "loaded") {
      const payload = weather.data || {};
      const metar = payload.metar;
      if (payload.outsideRange) {
        return (
          "<div class='" +
          wrapperClass +
          "'><h3>Flight Weather</h3><p class='muted'>METAR history is only shown for flights within the last 7 days.</p></div>"
        );
      }
      if (!metar) {
        return (
          "<div class='" +
          wrapperClass +
          "'><h3>Flight Weather</h3><p class='muted'>No METAR was found near this flight time.</p></div>"
        );
      }
      return (
        "<div class='" +
        wrapperClass +
        "'><div class='panel__header'><div><h3>Flight Weather</h3><p class='muted'>" +
        escapeHtml(
          (metar.stationId || "Station") +
            (metar.stationName ? " • " + metar.stationName : "") +
            " • " +
            formatWeatherObserved(metar.observedAt)
        ) +
        "</p></div><div class='card-header__meta'><span class='pill'>" +
        escapeHtml(
          metar.minutesFromFlight == null
            ? "Closest report"
            : Math.abs(metar.minutesFromFlight) + " min from flight"
        ) +
        "</span></div></div><div class='" +
        gridClass +
        "'>" +
        renderWeatherMetric("Wind", formatWind(metar)) +
        renderWeatherMetric("Visibility", metar.visibilityMiles ? metar.visibilityMiles + " sm" : "—") +
        renderWeatherMetric("Ceiling", metar.ceilingFtAgl ? metar.ceilingFtAgl + " ft" : "—") +
        renderWeatherMetric("Category", metar.flightCategory || "—") +
        renderWeatherMetric("Altimeter", metar.altimeterHg ? metar.altimeterHg + " inHg" : "—") +
        renderWeatherMetric(
          "Temp / Dew",
          (metar.temperatureC || "—") + " / " + (metar.dewpointC || "—") + " C"
        ) +
        "</div><p class='muted weather-raw'>" +
        escapeHtml(metar.rawText || metar.weatherString || "No raw METAR available.") +
        "</p></div>"
      );
    }
    return "";
  }

  function formatWind(metar) {
    if (!metar.windDirDegrees && !metar.windSpeedKt) {
      return "—";
    }
    let value = "";
    if (metar.windDirDegrees) {
      value += metar.windDirDegrees + "° ";
    }
    value += (metar.windSpeedKt || "0") + " kt";
    if (metar.windGustKt) {
      value += " G" + metar.windGustKt;
    }
    return value;
  }

  function renderWeatherMetric(label, value) {
    return (
      "<div class='weather-metric'><span>" +
      escapeHtml(label) +
      "</span><strong>" +
      escapeHtml(value) +
      "</strong></div>"
    );
  }

  function renderAdmin() {
    renderAdminGate();
    elements.adminWorkspace.hidden = !state.adminUnlocked;
    if (!state.adminUnlocked) {
      return;
    }

    renderLocationsSidebar();
    renderLocationEditor();
    renderTourMatrix();
    renderZoneInspector();
  }

  function renderAdminGate() {
    if (!elements.adminGate) {
      return;
    }
    elements.adminGate.innerHTML =
      "<div class='detail-card admin-gate-card'><div><p class='panel__eyebrow'>Authorized</p><h3>Secure Admin Session</h3><p class='muted'>You are editing the protected admin workspace. Changes save locally here and can be published to the shared weekly view when you are ready.</p></div><button id='lockAdminBtn' class='button button--ghost button--small'>Sign Out of Admin</button></div>";
  }

  function renderLocationsSidebar() {
    elements.locationsSidebar.innerHTML = state.config.locations
      .map(function eachLocation(location) {
        return (
          "<div class='stack-card" +
          (location.id === state.selectedLocationId ? " is-selected" : "") +
          "' data-location-id='" +
          escapeHtml(location.id) +
          "'><div class='panel__header'><div><h3>" +
          escapeHtml(location.name) +
          "</h3><p>" +
          escapeHtml(location.zones.length + " zones / " + locationTours(location.id).length + " tours") +
          "</p></div><span class='dot' style='background:" +
          escapeHtml(location.color) +
          "; width:16px; height:16px;'></span></div></div>"
        );
      })
      .join("");
  }

  function renderLocationEditor() {
    const location = currentLocation();
    if (!location) {
      elements.locationEditor.innerHTML =
        "<div class='empty-state'>Select or create a location to start editing.</div>";
      elements.adminLocationTitle.textContent = "Location Detail";
      return;
    }

    elements.adminLocationTitle.textContent = location.name;

    const zonesMarkup = location.zones.length
      ? location.zones
          .map(function eachZone(zone) {
            return (
              "<div class='zone-card' data-zone-id='" +
              escapeHtml(zone.id) +
              "'><div class='panel__header'><div><h3>" +
              escapeHtml(zone.name) +
              "</h3><p class='muted'>" +
              escapeHtml(
                zone.box.minLng.toFixed(6) +
                  ", " +
                  zone.box.minLat.toFixed(6) +
                  " to " +
                  zone.box.maxLng.toFixed(6) +
                  ", " +
                  zone.box.maxLat.toFixed(6)
              ) +
              "</p></div><div class='button-row'><button class='button button--ghost button--small' data-action='focus-zone' data-zone-id='" +
              escapeHtml(zone.id) +
              "'>Focus</button><button class='button button--ghost button--small' data-action='remove-zone' data-zone-id='" +
              escapeHtml(zone.id) +
              "'>Remove</button></div></div><div class='zone-grid'><label class='field'><span>Name</span><input data-zone-field='name' type='text' value='" +
              escapeHtml(zone.name) +
              "' /></label><label class='field'><span>Color</span><input data-zone-field='color' type='color' value='" +
              escapeHtml(zone.color) +
              "' /></label><label class='field'><span>Min lng</span><input data-zone-box-field='minLng' type='number' step='0.000001' value='" +
              escapeHtml(String(zone.box.minLng)) +
              "' /></label><label class='field'><span>Min lat</span><input data-zone-box-field='minLat' type='number' step='0.000001' value='" +
              escapeHtml(String(zone.box.minLat)) +
              "' /></label><label class='field'><span>Max lng</span><input data-zone-box-field='maxLng' type='number' step='0.000001' value='" +
              escapeHtml(String(zone.box.maxLng)) +
              "' /></label><label class='field'><span>Max lat</span><input data-zone-box-field='maxLat' type='number' step='0.000001' value='" +
              escapeHtml(String(zone.box.maxLat)) +
              "' /></label></div></div>"
            );
          })
          .join("")
      : "<div class='empty-state'>No zones yet. Add one manually or draw it on the map.</div>";

    elements.locationEditor.innerHTML =
      "<div class='editor-section'><div class='location-form'><label class='field'><span>Location name</span><input id='locationNameInput' data-location-field='name' type='text' value='" +
      escapeHtml(location.name) +
      "' /></label><label class='field'><span>Short label</span><input data-location-field='shortName' type='text' value='" +
      escapeHtml(location.shortName) +
      "' /></label><label class='field'><span>Route sets (comma-separated)</span><input data-location-field='routeSets' type='text' placeholder='Normal, TFR' value='" +
      escapeHtml((location.routeSets || []).join(", ")) +
      "' /></label><label class='field'><span>METAR stations (comma-separated)</span><input data-location-field='weatherStations' type='text' placeholder='KDET, KDTW' value='" +
      escapeHtml((location.weatherStations || []).join(", ")) +
      "' /></label><label class='field'><span>Theme color</span><input data-location-field='color' type='color' value='" +
      escapeHtml(location.color) +
      "' /></label><div class='field'><span>&nbsp;</span><button id='removeLocationBtn' class='button button--ghost'>Remove Location</button></div></div></div><div class='editor-section'>" +
      zonesMarkup +
      "</div>";
  }

  function renderTourMatrix() {
    const location = currentLocation();
    if (!location) {
      elements.tourMatrix.innerHTML = "";
      return;
    }

    const tours = locationTours(location.id);
    const routeSetOptions = parseRouteSetNames(location.routeSets);
    const rows = tours
      .map(function eachTour(tour) {
        return (
          "<tr data-tour-id='" +
          escapeHtml(tour.id) +
          "'><td class='tour-name-cell'><input data-tour-field='name' type='text' value='" +
          escapeHtml(tour.name) +
          "' /></td><td class='route-set-cell'><select data-tour-field='routeSet'>" +
          routeSetOptions
            .map(function eachRouteSet(routeSet) {
              return (
                "<option value='" +
                escapeHtml(routeSet) +
                "'" +
                (routeSet === blank(tour.routeSet).trim() ? " selected" : "") +
                ">" +
                escapeHtml(routeSet) +
                "</option>"
              );
            })
            .join("") +
          "</select></td><td class='time-cell'><input data-tour-field='minMinutes' type='text' value='" +
          escapeHtml(core.formatDuration(tour.minMinutes)) +
          "' /></td><td class='time-cell'><input data-tour-field='maxMinutes' type='text' value='" +
          escapeHtml(core.formatDuration(tour.maxMinutes)) +
          "' /></td><td class='time-cell'><input data-tour-field='goalMinutes' type='text' value='" +
          escapeHtml(core.formatDuration(tour.goalMinutes)) +
          "' /></td><td><div class='zone-picker'>" +
          location.zones
            .slice(0, 10)
            .map(function eachZone(zone) {
              const active = tour.zoneIds.includes(zone.id);
              return (
                "<button class='zone-toggle-pill" +
                (active ? " is-active" : "") +
                "' type='button' data-zone-toggle='" +
                escapeHtml(zone.id) +
                "' data-tour-id='" +
                escapeHtml(tour.id) +
                "'>" +
                "<span class='dot' style='background:" +
                escapeHtml(zone.color || location.color) +
                ";'></span>" +
                escapeHtml(zone.name) +
                "</button>"
              );
            })
            .join("") +
          "</div></td>" +
          "<td><button class='button button--ghost button--small' data-action='remove-tour' data-tour-id='" +
          escapeHtml(tour.id) +
          "'>Remove</button></td></tr>"
        );
      })
      .join("");

    elements.tourMatrix.innerHTML =
      "<table class='table tour-matrix-table'><thead><tr><th>Tour</th><th>Route Set</th><th>Min Time</th><th>Max Time</th><th>Goal Time</th><th>Zones</th><th></th></tr></thead><tbody>" +
      rows +
      "</tbody></table>";
  }

  function renderZoneInspector() {
    const location = currentLocation();
    if (!location) {
      elements.zoneInspector.innerHTML = "";
      return;
    }
    const zone =
      location.zones.find(function findZone(item) { return item.id === state.selectedZoneId; }) ||
      location.zones[0] ||
      null;

    if (!zone) {
      elements.zoneInspector.innerHTML =
        "<div class='empty-state'>Select a zone from the list or the map to see linked tours.</div>";
      return;
    }

    if (!state.selectedZoneId) {
      state.selectedZoneId = zone.id;
    }

    const tours = locationTours(location.id);
    const kmlMarkup = state.kmlFeatures.length
      ? "<div class='inspector-card'><div class='panel__header'><div><h3>KML Candidates</h3><p class='muted'>Import named KML shapes as zones for " +
        escapeHtml(location.name) +
        ".</p></div></div><div class='stack-list'>" +
        state.kmlFeatures
          .map(function eachFeature(feature) {
            return (
              "<div class='kml-item'><div><strong>" +
              escapeHtml(feature.name) +
              "</strong><p class='muted'>" +
              escapeHtml(feature.kind + " overlay") +
              "</p></div><button class='button button--ghost button--small' data-import-kml-zone='" +
              escapeHtml(feature.id) +
              "'>Import as Zone</button></div>"
            );
          })
          .join("") +
        "</div></div>"
      : "<div class='inspector-card'><div class='panel__header'><div><h3>KML Candidates</h3><p class='muted'>Upload a KML and its named placemarks will appear here as importable zone templates.</p></div></div></div>";

    elements.zoneInspector.innerHTML =
      "<div class='inspector-card'><div class='panel__header'><div><h3>" +
      escapeHtml(zone.name) +
      "</h3><p class='muted'>Rectangle linked to tours for " +
      escapeHtml(location.name) +
      ".</p></div><span class='dot' style='background:" +
      escapeHtml(zone.color) +
      "; width:18px; height:18px;'></span></div><div class='stack-list'>" +
      tours
        .map(function eachTour(tour) {
          return (
            "<label class='check-cell'><span>" +
            escapeHtml(tour.name) +
            "</span><input data-inspector-tour='" +
            escapeHtml(tour.id) +
            "' data-inspector-zone='" +
            escapeHtml(zone.id) +
            "' type='checkbox' " +
            (tour.zoneIds.includes(zone.id) ? "checked" : "") +
            " /></label>"
          );
        })
        .join("") +
      "</div></div>" +
      kmlMarkup;
  }

  function routeSegmentColor(startPoint, endPoint, index, totalSegments, flight) {
    const progress = totalSegments > 1 ? index / (totalSegments - 1) : 0;
    if (flight && flight.hasAltitude && Number.isFinite(flight.minAltitudeFt) && Number.isFinite(flight.maxAltitudeFt)) {
      const altitudeValues = [startPoint.altitudeFt, endPoint.altitudeFt].filter(function isFiniteAltitude(value) {
        return Number.isFinite(value);
      });
      if (altitudeValues.length) {
        const averageAltitude =
          altitudeValues.reduce(function sum(total, value) { return total + value; }, 0) /
          altitudeValues.length;
        const range = Math.max(1, flight.maxAltitudeFt - flight.minAltitudeFt);
        const altitudeRatio = Math.max(0, Math.min(1, (averageAltitude - flight.minAltitudeFt) / range));
        const hue = 150 + progress * 190;
        const lightness = 48 + altitudeRatio * 18;
        return "hsl(" + hue.toFixed(0) + ", 90%, " + lightness.toFixed(0) + "%)";
      }
    }
    const hue = 150 + progress * 190;
    return "hsl(" + hue.toFixed(0) + ", 88%, 60%)";
  }

  function renderFlightAltitudePill(flight) {
    if (
      !flight ||
      !flight.hasAltitude ||
      !Number.isFinite(flight.minAltitudeFt) ||
      !Number.isFinite(flight.maxAltitudeFt)
    ) {
      return "";
    }
    return (
      "<span class='pill pill--muted'>" +
      escapeHtml(
        Math.round(flight.minAltitudeFt) +
          "-" +
          Math.round(flight.maxAltitudeFt) +
          " ft"
      ) +
      "</span>"
    );
  }

  function renderConfigEditor(force) {
    if (state.configEditorDirty && !force) {
      return;
    }
    elements.configEditor.value = JSON.stringify(state.config, null, 2);
  }

  function flightTouchesLocation(flight, locationId) {
    if (!flight || !locationId) {
      return false;
    }
    if (flight.locationId === locationId) {
      return true;
    }
    return flight.zoneHits.some(function eachHit(hit) {
      return hit.locationId === locationId;
    });
  }

  function flightMatchesSelectedRouteSet(flight) {
    if (!state.selectedDashboardRouteSet) {
      return true;
    }
    if (!flight || !flight.bestEvaluation) {
      return true;
    }
    return blank(flight.bestEvaluation.routeSet).trim() === state.selectedDashboardRouteSet;
  }

  function renderEditorMap() {
    initializeMaps();
    if (!maps.editor) {
      return;
    }

    maps.drawnItems.clearLayers();
    const location = currentLocation();
    if (!location) {
      queueMapResize();
      return;
    }

    location.zones.forEach(function eachZone(zone) {
      const rectangle = L.rectangle(
        [
          [zone.box.minLat, zone.box.minLng],
          [zone.box.maxLat, zone.box.maxLng],
        ],
        {
          color: zone.color,
          weight: zone.id === state.selectedZoneId ? 4 : 2,
          fillOpacity: zone.id === state.selectedZoneId ? 0.24 : 0.14,
          zoneId: zone.id,
        }
      );
      rectangle.on("click", function onClick() {
        state.selectedZoneId = zone.id;
        renderZoneInspector();
        renderEditorMap();
      });
      rectangle.bindPopup(
        "<strong>" +
          escapeHtml(zone.name) +
          "</strong><br/>" +
          escapeHtml(
            locationTours(location.id)
              .filter(function eachTour(tour) { return tour.zoneIds.includes(zone.id); })
              .map(function eachTour(tour) { return tour.name; })
              .join(", ") || "No tours using this zone"
          )
      );
      maps.drawnItems.addLayer(rectangle);
    });
    fitEditorToUsefulBounds();
    queueMapResize();
  }

  function renderFlightMap() {
    initializeMaps();
    if (!maps.flight || !maps.flightGroup) {
      return;
    }

    maps.flightGroup.clearLayers();
    maps.lastFlightBounds = null;
    if (elements.flightMapMessage) {
      elements.flightMapMessage.hidden = true;
      elements.flightMapMessage.innerHTML = "";
    }
    const flight = currentFlight();
    if (!flight) {
      if (elements.flightMapMessage) {
        elements.flightMapMessage.hidden = false;
        elements.flightMapMessage.innerHTML =
          "<div><strong>Route preview unavailable</strong><br />Select a flight from the table to see the path.</div>";
      }
      maps.flight.setView([39.5, -84], 5, { animate: false });
      return;
    }

    const validPoints = flight.points.filter(function keepPoint(point) {
      return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
    });
    const latLngs = validPoints.map(function eachPoint(point) {
      return [point.latitude, point.longitude];
    });
    if (validPoints.length < 2) {
      if (elements.flightMapMessage) {
        elements.flightMapMessage.hidden = false;
        elements.flightMapMessage.innerHTML =
          "<div><strong>Route preview unavailable</strong><br />This flight does not have enough track points to draw a route.</div>";
      }
      maps.flight.setView([39.5, -84], 5, { animate: false });
      return;
    }
    const focusBounds = [];
    const glow = L.polyline(latLngs, {
      color: "rgba(6, 10, 18, 0.9)",
      weight: 10,
      opacity: 0.58,
      lineJoin: "round",
      lineCap: "round",
    }).addTo(maps.flightGroup);

    for (let index = 0; index < validPoints.length - 1; index += 1) {
      const startPoint = validPoints[index];
      const endPoint = validPoints[index + 1];
      L.polyline(
        [
          [startPoint.latitude, startPoint.longitude],
          [endPoint.latitude, endPoint.longitude],
        ],
        {
          color: routeSegmentColor(startPoint, endPoint, index, validPoints.length - 1, flight),
          weight: 4.5,
          opacity: 0.98,
          lineJoin: "round",
          lineCap: "round",
        }
      ).addTo(maps.flightGroup);
    }

    L.circleMarker(latLngs[0], {
      radius: 7,
      color: "#062216",
      fillColor: "#34d399",
      fillOpacity: 1,
      weight: 2,
    }).addTo(maps.flightGroup);
    L.circleMarker(latLngs[latLngs.length - 1], {
      radius: 7,
      color: "#2b0c0c",
      fillColor: "#fb7185",
      fillOpacity: 1,
      weight: 2,
    }).addTo(maps.flightGroup);
    if (glow.getBounds().isValid()) {
      focusBounds.push(glow.getBounds());
    }

    state.config.locations.forEach(function eachLocation(location) {
      location.zones.forEach(function eachZone(zone) {
        const rectangle = L.rectangle(
          [
            [zone.box.minLat, zone.box.minLng],
            [zone.box.maxLat, zone.box.maxLng],
          ],
          {
            color: location.color,
            weight: flight.zoneHits.some(function eachHit(hit) {
              return hit.zoneId === zone.id;
            })
              ? 2.5
              : 1.2,
            fillOpacity: flight.zoneHits.some(function eachHit(hit) {
              return hit.zoneId === zone.id;
            })
              ? 0.18
              : 0.05,
            dashArray: flight.zoneHits.some(function eachHit(hit) {
              return hit.zoneId === zone.id;
            })
              ? ""
              : "6 6",
          }
        )
          .bindTooltip(location.name + " / " + zone.name)
          .addTo(maps.flightGroup);
        if (flight.zoneHits.some(function eachHit(hit) { return hit.zoneId === zone.id; })) {
          focusBounds.push(rectangle.getBounds());
        }
      });
    });
    maps.flight.invalidateSize(true);
    if (focusBounds.length) {
      const combined = L.latLngBounds(focusBounds[0]);
      for (let index = 1; index < focusBounds.length; index += 1) {
        combined.extend(focusBounds[index]);
      }
      scheduleFlightMapFit(combined);
    } else {
      maps.flight.setView([39.5, -84], 5, { animate: false });
    }
    queueMapResize();
  }

  function applyKmlText(text) {
    initializeMaps();
    if (!globalObject.L || !maps.kmlGroup) {
      return;
    }
    maps.kmlGroup.clearLayers();
    try {
      const xml = new DOMParser().parseFromString(text, "application/xml");
      const placemarks = Array.from(xml.querySelectorAll("Placemark"));
      state.kmlFeatures = [];
      placemarks.forEach(function eachPlacemark(placemark, index) {
        const name = blank(
          placemark.querySelector("name") ? placemark.querySelector("name").textContent : ""
        ).trim() || "KML Shape " + (index + 1);
        const coordinateNode = placemark.querySelector("coordinates");
        if (!coordinateNode) {
          return;
        }
        const latLngs = blank(coordinateNode.textContent)
          .trim()
          .split(/\s+/)
          .map(function eachCoord(chunk) {
            const parts = chunk.split(",");
            return [Number(parts[1]), Number(parts[0])];
          })
          .filter(function keep(item) {
            return Number.isFinite(item[0]) && Number.isFinite(item[1]);
          });

        if (latLngs.length < 2) {
          return;
        }

        const bounds = L.latLngBounds(latLngs);
        const id = core.makeId("kml");
        const layer =
          latLngs.length > 2 && latLngs[0][0] === latLngs[latLngs.length - 1][0]
            ? L.polygon(latLngs, { color: "#f7d86a", weight: 2, fillOpacity: 0.08 })
            : L.polyline(latLngs, { color: "#f7d86a", weight: 2 });
        layer.bindTooltip(name);
        maps.kmlGroup.addLayer(layer);
        state.kmlFeatures.push({
          id: id,
          name: name,
          kind: layer instanceof L.Polygon ? "Polygon" : "Line",
          bounds: {
            minLat: bounds.getSouth(),
            maxLat: bounds.getNorth(),
            minLng: bounds.getWest(),
            maxLng: bounds.getEast(),
          },
        });
      });
      if (!state.kmlFeatures.length) {
        const coordinateNodes = Array.from(xml.querySelectorAll("coordinates"));
        coordinateNodes.forEach(function eachNode(node, index) {
          const latLngs = blank(node.textContent)
            .trim()
            .split(/\s+/)
            .map(function eachCoord(chunk) {
              const parts = chunk.split(",");
              return [Number(parts[1]), Number(parts[0])];
            })
            .filter(function keep(item) {
              return Number.isFinite(item[0]) && Number.isFinite(item[1]);
            });
          if (latLngs.length < 2) {
            return;
          }
          const bounds = L.latLngBounds(latLngs);
          const id = core.makeId("kml");
          const layer =
            latLngs.length > 2 && latLngs[0][0] === latLngs[latLngs.length - 1][0]
              ? L.polygon(latLngs, { color: "#f7d86a", weight: 2, fillOpacity: 0.08 })
              : L.polyline(latLngs, { color: "#f7d86a", weight: 2 });
          layer.bindTooltip("KML Shape " + (index + 1));
          maps.kmlGroup.addLayer(layer);
          state.kmlFeatures.push({
            id: id,
            name: "KML Shape " + (index + 1),
            kind: layer instanceof L.Polygon ? "Polygon" : "Line",
            bounds: {
              minLat: bounds.getSouth(),
              maxLat: bounds.getNorth(),
              minLng: bounds.getWest(),
              maxLng: bounds.getEast(),
            },
          });
        });
      }
      if (maps.kmlGroup.getLayers().length) {
        maps.editor.fitBounds(maps.kmlGroup.getBounds().pad(0.2));
      }
      renderZoneInspector();
      queueMapResize();
      setStatus("success", "KML overlay loaded.");
    } catch (error) {
      setStatus("error", "KML overlay could not be parsed.");
    }
  }

  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType || "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function readFile(file, callback) {
    const reader = new FileReader();
    reader.onload = function onLoad(event) {
      callback(String(event.target.result || ""));
    };
    reader.onerror = function onError() {
      setStatus("error", "That file could not be read.");
    };
    reader.readAsText(file);
  }

  function summaryEmailBody() {
    if (!state.analysis) {
      return "No summary is available yet.";
    }
    return state.analysis.summary.byLocation
      .map(function eachLocation(location) {
        const lines = location.rows.map(function eachRow(row) {
          return (
            (blank(row.routeSet).trim() ? "[" + blank(row.routeSet).trim() + "] " : "") +
            row.name +
            ": goal " +
            core.formatDuration(row.goalMinutes) +
            ", actual " +
            (row.avgMinutes == null ? "No Data" : core.formatDuration(row.avgMinutes)) +
            ", flights " +
            row.count
          );
        });
        return location.name + "\n" + lines.join("\n");
      })
      .join("\n\n");
  }

  document.querySelectorAll(".tab-button").forEach(function eachButton(button) {
    button.addEventListener("click", function onTabClick() {
      state.activeTab = button.getAttribute("data-tab");
      render();
      queueMapResize();
    });
  });

  elements.csvInput.addEventListener("change", function onCsvChange(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    readFile(file, function onText(text) {
      setLoading(true, "Analyzing Spidertracks CSV...");
      globalObject.setTimeout(function applyCsv() {
        clearStatus();
        handleCsvText(text);
        setLoading(false);
      }, 0);
    });
    event.target.value = "";
  });

  elements.csvDropZone.addEventListener("click", function onDropzoneClick() {
    elements.csvInput.click();
  });

  ["dragenter", "dragover"].forEach(function eachEvent(eventName) {
    elements.csvDropZone.addEventListener(eventName, function onDrag(event) {
      event.preventDefault();
      elements.csvDropZone.classList.add("is-active");
    });
  });

  ["dragleave", "drop"].forEach(function eachEvent(eventName) {
    elements.csvDropZone.addEventListener(eventName, function onDrag(event) {
      event.preventDefault();
      elements.csvDropZone.classList.remove("is-active");
    });
  });

  elements.csvDropZone.addEventListener("drop", function onDrop(event) {
    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }
    readFile(file, function onText(text) {
      setLoading(true, "Analyzing Spidertracks CSV...");
      globalObject.setTimeout(function applyCsv() {
        clearStatus();
        handleCsvText(text);
        setLoading(false);
      }, 0);
    });
  });

  elements.mappingPanel.addEventListener("change", function onMappingChange(event) {
    const key = event.target.getAttribute("data-mapping");
    if (!key) {
      return;
    }
    state.config.csvSettings[key] = event.target.value;
    saveConfig();
    if (state.csvText.trim()) {
      syncAnalysis();
    } else {
      render();
    }
  });

  elements.flightSearchInput.addEventListener("input", function onFlightSearch(event) {
    state.flightSearchQuery = event.target.value;
    render();
  });

  elements.flightsTable.addEventListener("click", function onFlightClick(event) {
    const row = event.target.closest("[data-flight-id]");
    if (!row) {
      return;
    }
    state.selectedFlightId = row.getAttribute("data-flight-id");
    renderFlights();
    loadWeatherForFlight(currentFlight());
    renderFlightDetail();
    renderFlightMap();
  });

  elements.flightDetail.addEventListener("click", function onFlightDetailClick(event) {
    if (event.target.id === "saveFlightAnnotationBtn") {
      const reasonInput = document.getElementById("flightReasonSelect");
      const noteInput = document.getElementById("flightReasonNote");
      saveFlightAnnotationForSelectedFlight(
        reasonInput ? reasonInput.value : "",
        noteInput ? noteInput.value : ""
      );
      return;
    }

    if (event.target.id === "clearFlightAnnotationBtn") {
      saveFlightAnnotationForSelectedFlight("", "");
    }
  });

  elements.flightDetail.addEventListener("focusout", function onFlightDetailFocusOut() {
    globalObject.setTimeout(function onBlurSettled() {
      if (state.pendingFlightDetailRefresh && !isEditingFlightAnnotation()) {
        refreshSelectedFlightDetail({ force: true });
      }
    }, 0);
  });

  elements.dashboardCards.addEventListener("click", function onDashboardClick(event) {
    const locationTarget = event.target.closest("[data-dashboard-location]");
    if (!locationTarget) {
      return;
    }
    state.selectedDashboardLocationId = locationTarget.getAttribute("data-dashboard-location");
    const tourId = locationTarget.getAttribute("data-dashboard-tour");
    const routeSet = locationTarget.getAttribute("data-dashboard-route-set");
    state.selectedDashboardTourId = tourId != null ? tourId : "";
    state.selectedDashboardRouteSet = routeSet != null ? routeSet : "";
    renderDashboard();
    renderDashboardDetail();
  });

  elements.dashboardDetail.addEventListener("click", function onDashboardDetailClick(event) {
    const filterTarget = event.target.closest("[data-dashboard-location]");
    if (filterTarget) {
      state.selectedDashboardLocationId = filterTarget.getAttribute("data-dashboard-location");
      state.selectedDashboardTourId = filterTarget.getAttribute("data-dashboard-tour") || "";
      state.selectedDashboardRouteSet = filterTarget.getAttribute("data-dashboard-route-set") || "";
      renderDashboard();
      renderDashboardDetail();
      return;
    }
    const flightRow = event.target.closest("[data-flight-id]");
    if (!flightRow) {
      return;
    }
    state.selectedFlightId = flightRow.getAttribute("data-flight-id");
    state.activeTab = "flights";
    render();
  });

  elements.loadDemoBtn.addEventListener("click", function onDemo() {
    state.configEditorDirty = false;
    state.adminUnlocked = false;
    setLoading(true, "Loading demo sheet...");
    globalObject.setTimeout(function applyDemo() {
      handleCsvText(core.SAMPLE_CSV);
      setLoading(false);
      setStatus("success", "Demo CSV loaded without replacing your saved tours or zones.");
    }, 0);
  });

  elements.publishStateBtn.addEventListener("click", function onPublishState() {
    publishSharedState();
  });

  elements.clearSheetBtn.addEventListener("click", function onClearSheet() {
    clearCurrentSheet();
  });

  elements.exportConfigBtn.addEventListener("click", function onExportConfig() {
    downloadText("mytourtimes-config.json", JSON.stringify(state.config, null, 2), "application/json");
  });

  elements.importConfigInput.addEventListener("change", function onImportConfig(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    readFile(file, function onText(text) {
      try {
        state.config = core.sanitizeConfig(JSON.parse(text));
        state.configEditorDirty = false;
        saveConfig();
        syncAnalysis();
        setStatus("success", "Config imported.");
      } catch (error) {
        setStatus("error", "Config JSON could not be parsed.");
      }
    });
    event.target.value = "";
  });

  elements.downloadSummaryBtn.addEventListener("click", function onDownloadSummary() {
    if (!state.analysis) {
      setStatus("error", "Load a CSV before downloading a summary.");
      return;
    }
    downloadText("tour-summary.csv", core.exportSummaryCsv(state.analysis), "text/csv");
  });

  elements.emailSummaryBtn.addEventListener("click", function onEmailSummary() {
    const subject = encodeURIComponent("MyTourTimes Summary");
    const body = encodeURIComponent(summaryEmailBody());
    globalObject.location.href = "mailto:?subject=" + subject + "&body=" + body;
  });

  if (elements.adminLogoutBtn) {
    elements.adminLogoutBtn.addEventListener("click", function onAdminLogout() {
      globalObject.location.href = "/admin/logout";
    });
  }

  elements.adminGate.addEventListener("click", function onAdminGateClick(event) {
    if (event.target.id === "lockAdminBtn") {
      globalObject.location.href = "/admin/logout";
    }
  });

  elements.adminGate.addEventListener("keydown", function onAdminGateKeydown(event) {
    return;
  });

  elements.locationsSidebar.addEventListener("click", function onLocationClick(event) {
    const card = event.target.closest("[data-location-id]");
    if (!card) {
      return;
    }
    state.selectedLocationId = card.getAttribute("data-location-id");
    state.selectedZoneId = "";
    renderAdmin();
    renderEditorMap();
    queueMapResize();
  });

  elements.addLocationBtn.addEventListener("click", function onAddLocation() {
    const location = {
      id: core.makeId("location"),
      name: "New Location",
      shortName: "NEW",
      color: "#4c6ef5",
      routeSets: ["Standard"],
      weatherStations: [],
      zones: [],
    };
    state.config.locations.push(location);
    state.selectedLocationId = location.id;
    state.config = core.sanitizeConfig(state.config);
    saveConfig();
    syncAnalysis();
  });

  elements.addZoneBtn.addEventListener("click", function onAddZone() {
    const location = currentLocation();
    if (!location) {
      return;
    }
    if (location.zones.length >= 10) {
      setStatus("error", "Each location can only have 10 zones.");
      return;
    }
    const center = maps.editor ? maps.editor.getCenter() : { lat: 0, lng: 0 };
    const zone = {
      id: core.makeId("zone"),
      name: "Zone " + (location.zones.length + 1),
      color: location.color,
      box: {
        minLat: center.lat - 0.01,
        maxLat: center.lat + 0.01,
        minLng: center.lng - 0.01,
        maxLng: center.lng + 0.01,
      },
    };
    updateLocation(location.id, function apply(locationToEdit) {
      locationToEdit.zones.push(zone);
    });
    state.selectedZoneId = zone.id;
  });

  elements.addTourBtn.addEventListener("click", function onAddTour() {
    const location = currentLocation();
    if (!location) {
      return;
    }
    state.config.tours.push({
      id: core.makeId("tour"),
      locationId: location.id,
      name: "New Tour",
      tag: "",
      routeSet: parseRouteSetNames(location.routeSets)[0],
      minMinutes: 0,
      maxMinutes: 0,
      goalMinutes: 0,
      zoneIds: [],
      notes: "",
    });
    state.config = core.sanitizeConfig(state.config);
    saveConfig();
    syncAnalysis();
  });

  elements.locationEditor.addEventListener("change", function onLocationEditorInput(event) {
    const location = currentLocation();
    if (!location) {
      return;
    }

    if (event.target.id === "removeLocationBtn") {
      return;
    }

    const locationField = event.target.getAttribute("data-location-field");
    if (locationField) {
      updateLocation(location.id, function apply(locationToEdit) {
        if (locationField === "routeSets") {
          locationToEdit.routeSets = parseRouteSetNames(event.target.value);
          return;
        }
        if (locationField === "weatherStations") {
          locationToEdit.weatherStations = parseStationIdentifiers(event.target.value);
          return;
        }
        locationToEdit[locationField] = event.target.value;
        if (locationField === "color") {
          locationToEdit.zones = locationToEdit.zones.map(function recolor(zone) {
            if (!zone.color || zone.color === location.color) {
              zone.color = event.target.value;
            }
            return zone;
          });
        }
      });
      return;
    }

    const zoneCard = event.target.closest("[data-zone-id]");
    if (!zoneCard) {
      return;
    }
    const zoneId = zoneCard.getAttribute("data-zone-id");
    const zoneField = event.target.getAttribute("data-zone-field");
    const zoneBoxField = event.target.getAttribute("data-zone-box-field");
    updateLocation(location.id, function apply(locationToEdit) {
      locationToEdit.zones = locationToEdit.zones.map(function eachZone(zone) {
        if (zone.id !== zoneId) {
          return zone;
        }
        if (zoneField) {
          zone[zoneField] = event.target.value;
        }
        if (zoneBoxField) {
          zone.box[zoneBoxField] = Number(event.target.value);
        }
        return zone;
      });
    });
    state.selectedZoneId = zoneId;
  });

  elements.locationEditor.addEventListener("click", function onLocationEditorClick(event) {
    const location = currentLocation();
    if (!location) {
      return;
    }

    if (event.target.id === "removeLocationBtn") {
      state.config.locations = state.config.locations.filter(function keepLocation(item) {
        return item.id !== location.id;
      });
      state.config.tours = state.config.tours.filter(function keepTour(tour) {
        return tour.locationId !== location.id;
      });
      state.selectedLocationId = state.config.locations[0] ? state.config.locations[0].id : "";
      state.selectedZoneId = "";
      state.config = core.sanitizeConfig(state.config);
      saveConfig();
      syncAnalysis();
      return;
    }

    const zoneId = event.target.getAttribute("data-zone-id");
    if (!zoneId) {
      return;
    }

    if (event.target.getAttribute("data-action") === "remove-zone") {
      removeZones([zoneId]);
    }

    if (event.target.getAttribute("data-action") === "focus-zone") {
      state.selectedZoneId = zoneId;
      renderZoneInspector();
      renderEditorMap();
    }
  });

  elements.tourMatrix.addEventListener("change", function onTourMatrixInput(event) {
    const row = event.target.closest("[data-tour-id]");
    if (!row) {
      return;
    }
    const tourId = row.getAttribute("data-tour-id");
    const field = event.target.getAttribute("data-tour-field");
    const zoneToggle = event.target.getAttribute("data-zone-toggle");

    updateTour(tourId, function apply(tour) {
      if (field === "minMinutes" || field === "maxMinutes" || field === "goalMinutes") {
        tour[field] = core.parseDurationToMinutes(event.target.value);
      }
      if (field === "name") {
        tour.name = event.target.value;
      }
      if (field === "routeSet") {
        tour.routeSet = event.target.value;
      }
      if (field === "tag") {
        tour.tag = event.target.value;
      }
    });
  });

  elements.tourMatrix.addEventListener("click", function onTourMatrixClick(event) {
    const zoneButton = event.target.closest("[data-zone-toggle]");
    if (zoneButton) {
      const tourId = zoneButton.getAttribute("data-tour-id");
      const zoneId = zoneButton.getAttribute("data-zone-toggle");
      updateTour(tourId, function apply(tour) {
        const active = tour.zoneIds.includes(zoneId);
        tour.zoneIds = active
          ? tour.zoneIds.filter(function keepZone(value) { return value !== zoneId; })
          : Array.from(new Set(tour.zoneIds.concat(zoneId)));
      });
      return;
    }

    if (event.target.getAttribute("data-action") !== "remove-tour") {
      return;
    }
    const tourId = event.target.getAttribute("data-tour-id");
    state.config.tours = state.config.tours.filter(function keepTour(tour) {
      return tour.id !== tourId;
    });
    state.config = core.sanitizeConfig(state.config);
    saveConfig();
    syncAnalysis();
  });

  elements.zoneInspector.addEventListener("change", function onInspectorChange(event) {
    const tourId = event.target.getAttribute("data-inspector-tour");
    const zoneId = event.target.getAttribute("data-inspector-zone");
    if (!tourId || !zoneId) {
      return;
    }
    updateTour(tourId, function apply(tour) {
      tour.zoneIds = event.target.checked
        ? Array.from(new Set(tour.zoneIds.concat(zoneId)))
        : tour.zoneIds.filter(function keepZoneId(value) { return value !== zoneId; });
    });
  });

  elements.zoneInspector.addEventListener("click", function onZoneInspectorClick(event) {
    const button = event.target.closest("[data-import-kml-zone]");
    if (!button) {
      return;
    }
    const location = currentLocation();
    if (!location) {
      setStatus("error", "Select a location before importing KML shapes.");
      return;
    }
    if (location.zones.length >= 10) {
      setStatus("error", "This location already has 10 zones.");
      return;
    }
    const feature = state.kmlFeatures.find(function findFeature(item) {
      return item.id === button.getAttribute("data-import-kml-zone");
    });
    if (!feature) {
      return;
    }
    updateLocation(location.id, function apply(locationToEdit) {
      locationToEdit.zones.push({
        id: core.makeId("zone"),
        name: feature.name,
        color: locationToEdit.color,
        box: feature.bounds,
      });
    });
    setStatus("success", "KML shape imported as a zone.");
  });

  elements.kmlInput.addEventListener("change", function onKmlChange(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    readFile(file, applyKmlText);
    event.target.value = "";
  });

  elements.clearKmlBtn.addEventListener("click", function onClearKml() {
    if (maps.kmlGroup) {
      maps.kmlGroup.clearLayers();
    }
    state.kmlFeatures = [];
    renderZoneInspector();
    fitEditorToUsefulBounds();
    queueMapResize();
  });

  elements.loadConfigToEditorBtn.addEventListener("click", function onLoadConfigEditor() {
    state.configEditorDirty = false;
    renderConfigEditor(true);
  });

  elements.configEditor.addEventListener("input", function onConfigEditorInput() {
    state.configEditorDirty = true;
  });

  elements.applyJsonBtn.addEventListener("click", function onApplyJson() {
    try {
      state.config = core.sanitizeConfig(JSON.parse(elements.configEditor.value));
      state.configEditorDirty = false;
      saveConfig();
      syncAnalysis();
      setStatus("success", "JSON config applied.");
    } catch (error) {
      setStatus("error", "The JSON config is invalid.");
    }
  });

  render();
  Promise.all([loadIndexedConfig(), loadSharedState()])
    .then(function restoreState(results) {
      const localConfig = results[0];
      const sharedState = results[1];
      const localFlightAnnotations = loadStoredFlightAnnotations();

      if (localConfig) {
        state.config = core.sanitizeConfig(localConfig);
      }
      seedMissingWeatherStations(state.config);
      state.flightAnnotations = localFlightAnnotations;
      saveFlightAnnotations();

      if (applySharedState(sharedState, { force: Boolean(sharedState && (sharedState.hasConfig || sharedState.hasCsv)) })) {
        return;
      }

      const savedCsv = loadSessionCsv();
      const persistentCsv = loadPersistentCsv();
      const csvToLoad = persistentCsv.trim() ? persistentCsv : savedCsv;

      if (csvToLoad.trim()) {
        handleCsvText(csvToLoad);
        return;
      }

      if (localConfig) {
        syncAnalysis();
      } else {
        render();
      }
    })
    .finally(function onReady() {
      setLoading(false);
      startSharedStateRefresh();
    });
})(typeof globalThis !== "undefined" ? globalThis : window);
