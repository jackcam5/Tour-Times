(function attachTrackerCore(globalObject) {
  const VALID_DATE_ORDERS = new Set(["auto", "DMY", "MDY", "YMD"]);
  const GOAL_BUFFER_MINUTES = 0.5;

  const SAMPLE_CSV = [
    '"Aircraft","Track","Point","DateTime(UTC)","DateTime(Local)","Latitude(decimal)","Longitude(decimal)","Description"',
    '"N746BP","TRK-DET-1","1","2026-03-29 23:59:00","2026-03-29 19:59:00","42.4097","-83.0053",""',
    '"N746BP","TRK-DET-1","2","2026-03-30 00:00:30","2026-03-29 20:00:30","42.4098","-83.0052","Take Off"',
    '"N746BP","TRK-DET-1","3","2026-03-30 00:02:00","2026-03-29 20:02:00","42.3880","-82.9986",""',
    '"N746BP","TRK-DET-1","4","2026-03-30 00:04:30","2026-03-29 20:04:30","42.3258","-83.1000",""',
    '"N746BP","TRK-DET-1","5","2026-03-30 00:08:10","2026-03-29 20:08:10","42.4097","-83.0050","Landing"',
    '"N752BP","TRK-SMK-1","1","2026-03-30 01:00:00","2026-03-29 21:00:00","35.8979","-83.5780","Take Off"',
    '"N752BP","TRK-SMK-1","2","2026-03-30 01:01:10","2026-03-29 21:01:10","35.8962","-83.5799",""',
    '"N752BP","TRK-SMK-1","3","2026-03-30 01:03:30","2026-03-29 21:03:30","35.8801","-83.5500",""',
    '"N752BP","TRK-SMK-1","4","2026-03-30 01:05:00","2026-03-29 21:05:00","35.7889","-83.5482",""',
    '"N752BP","TRK-SMK-1","5","2026-03-30 01:06:10","2026-03-29 21:06:10","35.8978","-83.5782","Landing"',
    '"N800ZZ","FERRY-1","1","2026-03-30 02:00:00","2026-03-29 22:00:00","42.4098","-83.0052","Take Off"',
    '"N800ZZ","FERRY-1","2","2026-03-30 02:02:30","2026-03-29 22:02:30","42.3650","-83.0500",""',
    '"N800ZZ","FERRY-1","3","2026-03-30 02:07:00","2026-03-29 22:07:00","42.5000","-83.3000","Landing"',
  ].join("\n");

  const DEFAULT_CONFIG = {
    adminPassword: "",
    csvSettings: {
      tailNumber: "Aircraft",
      timestamp: "DateTime(Local)",
      latitude: "Latitude(decimal)",
      longitude: "Longitude(decimal)",
      altitude: "Altitude(ft)",
      description: "Description",
      trackId: "Track",
      dateOrder: "YMD",
    },
    locations: [
      {
        id: "detroit",
        name: "Detroit",
        shortName: "DETROIT",
        color: "#1d5fa7",
        weatherStations: ["KDET"],
        routeSets: ["Normal", "TFR"],
        zones: [
          {
            id: "det-base",
            name: "Base",
            color: "#1d5fa7",
            box: { minLat: 42.395, maxLat: 42.418, minLng: -83.02, maxLng: -82.99 },
          },
          {
            id: "det-zone-1",
            name: "Zone 1",
            color: "#1d5fa7",
            box: { minLat: 42.376, maxLat: 42.417, minLng: -83.046, maxLng: -82.999 },
          },
          {
            id: "det-zone-3",
            name: "Zone 3",
            color: "#1d5fa7",
            box: { minLat: 42.324, maxLat: 42.337, minLng: -83.105, maxLng: -83.058 },
          },
        ],
      },
      {
        id: "smoky",
        name: "Smoky Mountains",
        shortName: "SMOKY",
        color: "#377d22",
        weatherStations: ["KGKT"],
        routeSets: ["Standard"],
        zones: [
          {
            id: "smoky-base",
            name: "Base",
            color: "#377d22",
            box: { minLat: 35.892, maxLat: 35.899, minLng: -83.583, maxLng: -83.576 },
          },
          {
            id: "smoky-zone-1",
            name: "Zone 1",
            color: "#377d22",
            box: { minLat: 35.8944, maxLat: 35.898, minLng: -83.5825, maxLng: -83.5766 },
          },
          {
            id: "smoky-zone-6",
            name: "Zone 6",
            color: "#377d22",
            box: { minLat: 35.952, maxLat: 35.956, minLng: -83.557, maxLng: -83.535 },
          },
          {
            id: "smoky-zone-10",
            name: "Zone 10",
            color: "#377d22",
            box: { minLat: 35.878, maxLat: 35.899, minLng: -83.567, maxLng: -83.546 },
          },
        ],
      },
    ],
    tours: [
      {
        id: "det-quick-hop",
        locationId: "detroit",
        name: "Quick Hop",
        tag: "",
        routeSet: "Normal",
        minMinutes: 6,
        maxMinutes: 10,
        goalMinutes: 6.5,
        zoneIds: ["det-zone-1"],
        notes: "",
      },
      {
        id: "det-downtown",
        locationId: "detroit",
        name: "Downtown",
        tag: "",
        routeSet: "Normal",
        minMinutes: 8.5,
        maxMinutes: 14,
        goalMinutes: 9,
        zoneIds: ["det-zone-1", "det-zone-3"],
        notes: "",
      },
      {
        id: "smoky-intro",
        locationId: "smoky",
        name: "Intro",
        tag: "",
        routeSet: "Standard",
        minMinutes: 0.75,
        maxMinutes: 2.7,
        goalMinutes: 1,
        zoneIds: ["smoky-zone-1"],
        notes: "",
      },
      {
        id: "smoky-country",
        locationId: "smoky",
        name: "Country Side",
        tag: "",
        routeSet: "Standard",
        minMinutes: 4.8,
        maxMinutes: 6.5,
        goalMinutes: 5.5,
        zoneIds: ["smoky-zone-1", "smoky-zone-10"],
        notes: "",
      },
    ],
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  function blank(value) {
    return value == null ? "" : String(value);
  }

  function makeFlightStableKey(flight) {
    return [
      blank(flight && flight.tailNumber).trim().toUpperCase(),
      blank(flight && flight.trackId).trim().toUpperCase(),
      flight && flight.takeoffAt instanceof Date ? flight.takeoffAt.toISOString() : "",
      flight && flight.landingAt instanceof Date ? flight.landingAt.toISOString() : "",
    ].join("|");
  }

  function clampNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function parseNumber(value) {
    const cleaned = blank(value).trim().replace(/,/g, "");
    if (!cleaned) {
      return null;
    }
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function parseCsv(text) {
    const normalized = blank(text).replace(/^\uFEFF/, "");
    if (!normalized.trim()) {
      return { headers: [], rows: [] };
    }

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let index = 0; index < normalized.length; index += 1) {
      const character = normalized[index];
      const nextCharacter = normalized[index + 1];

      if (inQuotes) {
        if (character === '"' && nextCharacter === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          inQuotes = false;
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"') {
        inQuotes = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (character === "\r") {
        if (nextCharacter === "\n") {
          continue;
        }
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    row.push(field);
    rows.push(row);

    const cleaned = rows.filter(function keep(record) {
      return record.some(function hasValue(cell) {
        return blank(cell).trim() !== "";
      });
    });

    return {
      headers: cleaned[0] || [],
      rows: cleaned.slice(1),
    };
  }

  function rowsToObjects(headers, rows) {
    return rows.map(function toObject(row, index) {
      const object = { __rowNumber: index + 2 };
      headers.forEach(function assign(header, columnIndex) {
        object[header] = blank(row[columnIndex]);
      });
      return object;
    });
  }

  function inferMapping(headers) {
    const candidates = Array.isArray(headers) ? headers : [];

    function pick(patterns) {
      return (
        candidates.find(function findHeader(header) {
          const lowered = header.toLowerCase();
          return patterns.some(function match(pattern) {
            return lowered.includes(pattern);
          });
        }) || ""
      );
    }

    return {
      tailNumber: pick(["aircraft", "tail", "registration"]),
      timestamp: pick(["datetime(local)", "local", "timestamp", "time", "date"]),
      latitude: pick(["latitude(decimal)", "lat decimal", "latitude"]),
      longitude: pick(["longitude(decimal)", "long decimal", "longitude"]),
      altitude: pick(["altitude(ft)", "altitude", "alt ft"]),
      description: pick(["description", "event", "status"]),
      trackId: pick(["track", "trip", "flight"]),
    };
  }

  function tryNativeDate(text) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseTimestamp(value, dateOrder) {
    const text = blank(value).trim();
    if (!text) {
      return null;
    }

    if (/^\d{10,13}$/.test(text)) {
      const epoch = text.length === 13 ? Number(text) : Number(text) * 1000;
      const date = new Date(epoch);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(text) || /[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
      return tryNativeDate(text);
    }

    const match = text.match(
      /^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})(?:[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?$/
    );

    if (!match) {
      return tryNativeDate(text);
    }

    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const secondValue = Number(match[6] || 0);
    let year;
    let month;
    let day;

    if (String(match[1]).length === 4 || dateOrder === "YMD") {
      year = first;
      month = second;
      day = third;
    } else if (dateOrder === "MDY") {
      month = first;
      day = second;
      year = third;
    } else if (dateOrder === "DMY") {
      day = first;
      month = second;
      year = third;
    } else if (first > 12 && second <= 12) {
      day = first;
      month = second;
      year = third;
    } else {
      month = first;
      day = second;
      year = third;
    }

    const parsed = new Date(year, month - 1, day, hour, minute, secondValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function extractWallClockMinutes(text, fallbackDate) {
    const match = blank(text).match(/(?:[ T]|^)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60;
    }
    return fallbackDate ? fallbackDate.getHours() * 60 + fallbackDate.getMinutes() : null;
  }

  function formatDateLabel(text, fallbackDate) {
    const cleaned = blank(text).trim();
    if (cleaned) {
      return cleaned.replace("T", " ");
    }
    return fallbackDate ? fallbackDate.toISOString() : "";
  }

  function parseDurationToMinutes(value) {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const text = blank(value).trim();
    if (!text) {
      return 0;
    }
    if (/^\d+(\.\d+)?$/.test(text)) {
      return Number(text);
    }

    const parts = text.split(":").map(Number);
    if (parts.some(function hasNaN(part) { return Number.isNaN(part); })) {
      return 0;
    }
    if (parts.length === 3) {
      return parts[0] * 60 + parts[1] + parts[2] / 60;
    }
    if (parts.length === 2) {
      return parts[0] + parts[1] / 60;
    }
    return 0;
  }

  function formatDuration(minutes) {
    if (minutes == null || !Number.isFinite(minutes)) {
      return "No Data";
    }

    const totalSeconds = Math.round(minutes * 60);
    const sign = totalSeconds < 0 ? "-" : "";
    const absolute = Math.abs(totalSeconds);
    const hours = Math.floor(absolute / 3600);
    const mins = Math.floor((absolute % 3600) / 60);
    const seconds = absolute % 60;
    return (
      sign +
      String(hours).padStart(1, "0") +
      ":" +
      String(mins).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0")
    );
  }

  function sanitizeZone(zone, index, fallbackColor) {
    const source = zone || {};
    const box = source.box || {};
    const minLat = clampNumber(box.minLat, 0);
    const maxLat = clampNumber(box.maxLat, 0);
    const minLng = clampNumber(box.minLng, 0);
    const maxLng = clampNumber(box.maxLng, 0);

    return {
      id: blank(source.id) || makeId("zone"),
      name: blank(source.name) || "Zone " + (index + 1),
      color: blank(source.color) || fallbackColor || "#1d5fa7",
      box: {
        minLat: Math.min(minLat, maxLat),
        maxLat: Math.max(minLat, maxLat),
        minLng: Math.min(minLng, maxLng),
        maxLng: Math.max(minLng, maxLng),
      },
    };
  }

  function defaultRouteSetsForLocationName(name) {
    const key = blank(name).trim().toLowerCase();
    if (key === "detroit") {
      return ["Normal", "TFR"];
    }
    return ["Standard"];
  }

  function sanitizeLocation(location, index) {
    const source = location || {};
    const color = blank(source.color) || "#1d5fa7";
    const zones = Array.isArray(source.zones) ? source.zones.slice(0, 10) : [];
    const routeSetsSource = Array.isArray(source.routeSets)
      ? source.routeSets
      : blank(source.routeSets).split(",");
    const weatherStationsSource = Array.isArray(source.weatherStations)
      ? source.weatherStations
      : blank(source.weatherStations).split(/[,\s]+/);
    return {
      id: blank(source.id) || makeId("location"),
      name: blank(source.name) || "Location " + (index + 1),
      shortName: blank(source.shortName) || blank(source.name || "Location").toUpperCase(),
      color,
      routeSets: routeSetsSource
        .map(function eachRouteSet(routeSet) { return blank(routeSet).trim(); })
        .filter(Boolean)
        .filter(function keepUnique(routeSet, routeSetIndex, list) {
          return list.indexOf(routeSet) === routeSetIndex;
        })
        .slice(0, 6),
      weatherStations: weatherStationsSource
        .map(function eachStation(station) { return blank(station).trim().toUpperCase(); })
        .filter(Boolean)
        .slice(0, 8),
      zones: zones.map(function eachZone(zone, zoneIndex) {
        return sanitizeZone(zone, zoneIndex, color);
      }),
    };
  }

  function sanitizeTour(tour, index) {
    const source = tour || {};
    return {
      id: blank(source.id) || makeId("tour"),
      locationId: blank(source.locationId),
      name: blank(source.name) || "Tour " + (index + 1),
      tag: blank(source.tag),
      routeSet: blank(source.routeSet).trim(),
      minMinutes: parseDurationToMinutes(source.minMinutes),
      maxMinutes: parseDurationToMinutes(source.maxMinutes),
      goalMinutes: parseDurationToMinutes(source.goalMinutes),
      zoneIds: Array.isArray(source.zoneIds)
        ? source.zoneIds.map(function eachZoneId(zoneId) { return blank(zoneId); }).filter(Boolean)
        : [],
      notes: blank(source.notes),
    };
  }

  function sanitizeConfig(config) {
    const source = config || {};
    const csvSettings = source.csvSettings || {};
    const locations = Array.isArray(source.locations)
      ? source.locations.map(sanitizeLocation)
      : deepClone(DEFAULT_CONFIG.locations);
    const locationRouteSetMap = new Map(
      locations.map(function toEntry(location) {
        const routeSets = location.routeSets && location.routeSets.length
          ? location.routeSets.slice()
          : defaultRouteSetsForLocationName(location.name);
        location.routeSets = routeSets;
        return [location.id, routeSets];
      })
    );
    const tours = Array.isArray(source.tours)
      ? source.tours.map(sanitizeTour).map(function normalizeRouteSet(tour) {
          const routeSets = locationRouteSetMap.get(tour.locationId) || ["Standard"];
          if (!tour.routeSet || routeSets.indexOf(tour.routeSet) === -1) {
            tour.routeSet = routeSets[0];
          }
          return tour;
        })
      : deepClone(DEFAULT_CONFIG.tours);
    return {
      adminPassword: blank(source.adminPassword),
      csvSettings: {
        tailNumber: blank(csvSettings.tailNumber),
        timestamp: blank(csvSettings.timestamp),
        latitude: blank(csvSettings.latitude),
        longitude: blank(csvSettings.longitude),
        altitude: blank(csvSettings.altitude),
        description: blank(csvSettings.description),
        trackId: blank(csvSettings.trackId),
        dateOrder: VALID_DATE_ORDERS.has(csvSettings.dateOrder) ? csvSettings.dateOrder : "auto",
      },
      locations: locations,
      tours: tours,
    };
  }

  function normalizeFlightPoints(rowObjects, config) {
    const csvSettings = config.csvSettings;
    const errors = [];

    const points = rowObjects
      .map(function toPoint(rowObject) {
        const timestampText = blank(rowObject[csvSettings.timestamp]).trim();
        const timestamp = parseTimestamp(timestampText, csvSettings.dateOrder);
        const latitude = parseNumber(rowObject[csvSettings.latitude]);
        const longitude = parseNumber(rowObject[csvSettings.longitude]);
        const altitudeFt = parseNumber(rowObject[csvSettings.altitude]);
        const tailNumber = blank(rowObject[csvSettings.tailNumber]).trim();
        const description = blank(rowObject[csvSettings.description]).trim();
        const trackId = blank(rowObject[csvSettings.trackId]).trim();

        if (!timestamp || latitude == null || longitude == null || !tailNumber) {
          errors.push({
            rowNumber: rowObject.__rowNumber,
            message: "Missing required time, tail, latitude, or longitude fields",
          });
          return null;
        }

        return {
          id: makeId("point"),
          rowNumber: rowObject.__rowNumber,
          tailNumber: tailNumber,
          trackId: trackId,
          description: description,
          timestamp: timestamp,
          timestampLabel: formatDateLabel(timestampText, timestamp),
          wallClockMinutes: extractWallClockMinutes(timestampText, timestamp),
          latitude: latitude,
          longitude: longitude,
          altitudeFt: altitudeFt,
          rawRow: rowObject,
        };
      })
      .filter(Boolean)
      .sort(function byPoint(left, right) {
        if (left.tailNumber === right.tailNumber) {
          return left.timestamp.getTime() - right.timestamp.getTime();
        }
        return left.tailNumber.localeCompare(right.tailNumber);
      });

    return { points: points, errors: errors };
  }

  function isTakeOff(description) {
    return blank(description).toLowerCase().includes("take off");
  }

  function isLanding(description) {
    return blank(description).toLowerCase().includes("landing");
  }

  function segmentFlights(points) {
    const byTail = new Map();
    points.forEach(function group(point) {
      if (!byTail.has(point.tailNumber)) {
        byTail.set(point.tailNumber, []);
      }
      byTail.get(point.tailNumber).push(point);
    });

    const flights = [];
    byTail.forEach(function buildFlights(tailPoints, tailNumber) {
      tailPoints.sort(function byTime(left, right) {
        return left.timestamp.getTime() - right.timestamp.getTime();
      });

      let currentFlight = null;

      tailPoints.forEach(function walk(point) {
        if (isTakeOff(point.description)) {
          currentFlight = {
            id: makeId("flight"),
            tailNumber: tailNumber,
            trackId: point.trackId,
            takeoffAt: point.timestamp,
            takeoffLabel: point.timestampLabel,
            startWallClockMinutes: point.wallClockMinutes,
            points: [point],
          };
          return;
        }

        if (!currentFlight) {
          return;
        }

        currentFlight.points.push(point);

        if (isLanding(point.description)) {
          currentFlight.landingAt = point.timestamp;
          currentFlight.landingLabel = point.timestampLabel;
          currentFlight.durationMinutes =
            (currentFlight.landingAt.getTime() - currentFlight.takeoffAt.getTime()) / 60000;
          currentFlight.durationLabel = formatDuration(currentFlight.durationMinutes);
          const midpointIndex = Math.floor(currentFlight.points.length / 2);
          const midpointPoint = currentFlight.points[midpointIndex] || currentFlight.points[0];
          currentFlight.midpointAt = new Date(
            currentFlight.takeoffAt.getTime() +
              (currentFlight.landingAt.getTime() - currentFlight.takeoffAt.getTime()) / 2
          );
          currentFlight.midpointLabel = midpointPoint
            ? midpointPoint.timestampLabel
            : currentFlight.takeoffLabel;
          currentFlight.midLatitude = midpointPoint ? midpointPoint.latitude : null;
          currentFlight.midLongitude = midpointPoint ? midpointPoint.longitude : null;
          currentFlight.avgLatitude =
            currentFlight.points.reduce(function sum(total, item) {
              return total + item.latitude;
            }, 0) / currentFlight.points.length;
          currentFlight.avgLongitude =
            currentFlight.points.reduce(function sum(total, item) {
              return total + item.longitude;
            }, 0) / currentFlight.points.length;
          const altitudePoints = currentFlight.points.filter(function withAltitude(item) {
            return Number.isFinite(item.altitudeFt);
          });
          currentFlight.hasAltitude = altitudePoints.length >= 2;
          currentFlight.minAltitudeFt = altitudePoints.length
            ? altitudePoints.reduce(function minAltitude(lowest, item) {
                return Math.min(lowest, item.altitudeFt);
              }, altitudePoints[0].altitudeFt)
            : null;
          currentFlight.maxAltitudeFt = altitudePoints.length
            ? altitudePoints.reduce(function maxAltitude(highest, item) {
                return Math.max(highest, item.altitudeFt);
              }, altitudePoints[0].altitudeFt)
            : null;
          currentFlight.stableKey = makeFlightStableKey(currentFlight);
          flights.push(currentFlight);
          currentFlight = null;
        }
      });
    });

    return flights.sort(function byFlight(left, right) {
      return left.takeoffAt.getTime() - right.takeoffAt.getTime();
    });
  }

  function pointInBox(point, box) {
    return (
      point.latitude >= box.minLat &&
      point.latitude <= box.maxLat &&
      point.longitude >= box.minLng &&
      point.longitude <= box.maxLng
    );
  }

  function analyzeFlight(flight, config) {
    const locationMap = new Map();
    const zoneMap = new Map();
    config.locations.forEach(function eachLocation(location) {
      locationMap.set(location.id, location);
      location.zones.forEach(function eachZone(zone) {
        zoneMap.set(zone.id, {
          id: zone.id,
          name: zone.name,
          color: zone.color,
          locationId: location.id,
          locationName: location.name,
          box: zone.box,
        });
      });
    });

    const zoneHits = [];
    zoneMap.forEach(function checkZone(zone) {
      for (let index = 0; index < flight.points.length; index += 1) {
        const point = flight.points[index];
        if (pointInBox(point, zone.box)) {
          zoneHits.push({
            zoneId: zone.id,
            zoneName: zone.name,
            locationId: zone.locationId,
            locationName: zone.locationName,
            hitAt: point.timestamp,
            hitLabel: point.timestampLabel,
            hitIndex: index,
          });
          break;
        }
      }
    });

    const zoneHitMap = new Map(
      zoneHits.map(function eachHit(hit) {
        return [hit.zoneId, hit];
      })
    );

    const evaluations = config.tours.map(function evaluateTour(tour) {
      const location = locationMap.get(tour.locationId);
      const requiredZoneIds = tour.zoneIds.filter(Boolean);
      const matchedZones = requiredZoneIds.filter(function eachZoneId(zoneId) {
        return zoneHitMap.has(zoneId);
      });
      const allZonesHit = requiredZoneIds.length > 0 && matchedZones.length === requiredZoneIds.length;
      const withinMin = !tour.minMinutes || flight.durationMinutes >= tour.minMinutes;
      const withinMax = !tour.maxMinutes || flight.durationMinutes <= tour.maxMinutes;
      const withinDurationWindow = withinMin && withinMax;
      const diffFromGoal = flight.durationMinutes - tour.goalMinutes;
      const withinGoalBuffer = flight.durationMinutes <= tour.goalMinutes + GOAL_BUFFER_MINUTES;
      const matchScore =
        matchedZones.length * 100 +
        (allZonesHit ? 400 : 0) +
        (withinDurationWindow ? 200 : 0) -
        Math.abs(diffFromGoal || 0);

      return {
        tourId: tour.id,
        tourName: tour.name,
        tag: tour.tag,
        routeSet: tour.routeSet,
        locationId: tour.locationId,
        locationName: location ? location.name : "",
        requiredZoneIds: requiredZoneIds,
        matchedZones: matchedZones,
        allZonesHit: allZonesHit,
        withinDurationWindow: withinDurationWindow,
        assigned: allZonesHit && withinDurationWindow,
        minMinutes: tour.minMinutes,
        maxMinutes: tour.maxMinutes,
        goalMinutes: tour.goalMinutes,
        diffFromGoal: diffFromGoal,
        diffLabel: formatDuration(diffFromGoal),
        withinGoalBuffer: withinGoalBuffer,
        matchScore: matchScore,
      };
    });

    const bestEvaluation =
      evaluations.slice().sort(function byScore(left, right) {
        if (left.assigned !== right.assigned) {
          return left.assigned ? -1 : 1;
        }
        if (left.matchScore !== right.matchScore) {
          return right.matchScore - left.matchScore;
        }
        return Math.abs(left.diffFromGoal) - Math.abs(right.diffFromGoal);
      })[0] || null;

    flight.zoneHits = zoneHits.sort(function byHit(left, right) {
      return left.hitAt.getTime() - right.hitAt.getTime();
    });
    flight.zoneHitNames = flight.zoneHits.map(function eachHit(hit) { return hit.zoneName; });
    flight.evaluations = evaluations;
    flight.bestEvaluation = bestEvaluation;
    flight.assigned = Boolean(bestEvaluation && bestEvaluation.assigned);
    flight.locationId = bestEvaluation && bestEvaluation.assigned ? bestEvaluation.locationId : "";
    flight.locationName = bestEvaluation && bestEvaluation.assigned ? bestEvaluation.locationName : "Unassigned";
    flight.status = !bestEvaluation
      ? "Unassigned"
      : bestEvaluation.assigned
        ? bestEvaluation.withinGoalBuffer
          ? "On Plan"
          : "Over Goal"
        : bestEvaluation.allZonesHit
          ? "Outside Duration"
          : "Unassigned";
    return flight;
  }

  function average(values) {
    if (!values.length) {
      return null;
    }
    return values.reduce(function sum(total, value) { return total + value; }, 0) / values.length;
  }

  function toneForDifference(diffMinutes) {
    if (diffMinutes == null) {
      return "muted";
    }
    const absolute = Math.abs(diffMinutes);
    if (absolute <= 0.5) {
      return "good";
    }
    if (absolute <= 1.25) {
      return "warn";
    }
    return "bad";
  }

  function summarize(config, flights) {
    const byLocation = config.locations.map(function eachLocation(location) {
      const locationTours = config.tours.filter(function eachTour(tour) {
        return tour.locationId === location.id;
      });
      const rows = locationTours.map(function eachTour(tour) {
        const matches = flights.filter(function eachFlight(flight) {
          return flight.bestEvaluation && flight.bestEvaluation.assigned && flight.bestEvaluation.tourId === tour.id;
        });
        const avgMinutes = average(
          matches.map(function duration(flight) { return flight.durationMinutes; })
        );
        const diffMinutes = avgMinutes == null ? null : avgMinutes - tour.goalMinutes;
        return {
          tourId: tour.id,
          name: tour.name,
          routeSet: tour.routeSet,
          goalMinutes: tour.goalMinutes,
          avgMinutes: avgMinutes,
          diffMinutes: diffMinutes,
          tone: toneForDifference(diffMinutes),
          count: matches.length,
        };
      });

      return {
        locationId: location.id,
        name: location.name,
        shortName: location.shortName,
        color: location.color,
        routeSets: location.routeSets && location.routeSets.length
          ? location.routeSets.slice()
          : ["Standard"],
        rows: rows,
        totalFlights: rows.reduce(function sum(total, row) { return total + row.count; }, 0),
        avgLoadMinutes: average(
          flights
            .filter(function eachFlight(flight) { return flight.locationId === location.id; })
            .map(function eachFlight(flight) { return flight.durationMinutes; })
        ),
      };
    });

    const assignedFlights = flights.filter(function eachFlight(flight) { return flight.assigned; });
    const start = flights[0] ? flights[0].takeoffAt : null;
    const end = flights[flights.length - 1] ? flights[flights.length - 1].landingAt : null;

    return {
      byLocation: byLocation,
      totalFlights: flights.length,
      matchedFlights: assignedFlights.length,
      unmatchedFlights: flights.length - assignedFlights.length,
      avgMatchedMinutes: average(
        assignedFlights.map(function eachFlight(flight) { return flight.durationMinutes; })
      ),
      start: start,
      end: end,
    };
  }

  function analyzeRows(rowObjects, configInput) {
    const config = sanitizeConfig(configInput);
    const normalized = normalizeFlightPoints(rowObjects, config);
    const segmented = segmentFlights(normalized.points).map(function eachFlight(flight) {
      return analyzeFlight(flight, config);
    });

    return {
      config: config,
      flights: segmented,
      errors: normalized.errors,
      skippedRows: normalized.errors.length,
      summary: summarize(config, segmented),
    };
  }

  function formatDateRange(start, end) {
    if (!start || !end) {
      return "";
    }
    const formatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return "Showing data from " + formatter.format(start) + " to " + formatter.format(end);
  }

  function exportSummaryCsv(analysis) {
    const lines = [["Location", "Route Set", "Tour", "Goal", "Actual", "Difference", "# Flights"]];
    analysis.summary.byLocation.forEach(function eachLocation(location) {
      location.rows.forEach(function eachRow(row) {
        lines.push([
          location.name,
          row.routeSet || "",
          row.name,
          formatDuration(row.goalMinutes),
          row.avgMinutes == null ? "" : formatDuration(row.avgMinutes),
          row.diffMinutes == null ? "" : formatDuration(row.diffMinutes),
          row.count,
        ]);
      });
    });
    return lines
      .map(function eachRow(row) {
        return row
          .map(function eachCell(cell) {
            const text = blank(cell).replace(/"/g, '""');
            return '"' + text + '"';
          })
          .join(",");
      })
      .join("\n");
  }

  const api = {
    DEFAULT_CONFIG: sanitizeConfig(DEFAULT_CONFIG),
    GOAL_BUFFER_MINUTES: GOAL_BUFFER_MINUTES,
    SAMPLE_CSV: SAMPLE_CSV,
    analyzeRows: analyzeRows,
    deepClone: deepClone,
    exportSummaryCsv: exportSummaryCsv,
    formatDateRange: formatDateRange,
    formatDuration: formatDuration,
    inferMapping: inferMapping,
    makeId: makeId,
    parseCsv: parseCsv,
    parseDurationToMinutes: parseDurationToMinutes,
    parseTimestamp: parseTimestamp,
    rowsToObjects: rowsToObjects,
    sanitizeConfig: sanitizeConfig,
    toneForDifference: toneForDifference,
  };

  globalObject.TourTrackerCore = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
