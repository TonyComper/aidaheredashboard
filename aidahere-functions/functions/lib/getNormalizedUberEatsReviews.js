// functions/lib/getNormalizedUberEatsReviews.js

const { getUberEatsSource } = require("./getUberEatsSource");
const { fetchUberEatsReviews } = require("./fetchUberEatsReviews");
const { waitForApifyRun } = require("./waitForApifyRun");
const { getApifyDatasetItems } = require("./getApifyDatasetItems");
const { normalizeUberEatsReviews } = require("./normalizeUberEatsReviews");

async function getNormalizedUberEatsReviews(restaurantCode, options = {}) {
  if (!restaurantCode) {
    throw new Error("Missing restaurantCode");
  }

  const maxReviews = options.maxReviews || 20;

  const source = await getUberEatsSource(restaurantCode);

  if (!source.ok) {
    throw new Error(source.reason || "Unable to load Uber Eats source");
  }

  if (!source.enabled) {
    return [];
  }

  const startedRun = await fetchUberEatsReviews({
    storeUrl: source.storeUrl,
    maxReviews,
  });

  const finishedRun = await waitForApifyRun(startedRun.runId, {
    timeoutMs: 120000,
    intervalMs: 3000,
  });

  const rawItems = await getApifyDatasetItems(finishedRun.datasetId);
  const normalized = normalizeUberEatsReviews(rawItems, restaurantCode);

  return normalized;
}

module.exports = {
  getNormalizedUberEatsReviews,
};