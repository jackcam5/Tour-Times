const core = require("./tracker-core.js");

const parsed = core.parseCsv(core.SAMPLE_CSV);
const rowObjects = core.rowsToObjects(parsed.headers, parsed.rows);
const analysis = core.analyzeRows(rowObjects, core.DEFAULT_CONFIG);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(analysis.summary.tripCount === 3, "Expected demo data to create 3 trips");
assert(analysis.summary.pointCount === 23, "Expected 23 valid points in demo data");
assert(analysis.summary.matchedTrips === 2, "Expected 2 passing trips in demo data");

const harbourTrip = analysis.trips.find((trip) => trip.tripId === "HH-101");
const failingTrip = analysis.trips.find((trip) => trip.tripId === "HH-303");

assert(harbourTrip.bestEvaluation.pass === true, "HH-101 should pass its tour timing");
assert(failingTrip.bestEvaluation.pass === false, "HH-303 should fail its tour timing");

console.log("Smoke test passed.");
