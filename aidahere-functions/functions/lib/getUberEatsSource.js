// functions/lib/getUberEatsSource.js

const admin = require("firebase-admin");

async function getUberEatsSource(restaurantCode) {
  if (!restaurantCode) {
    throw new Error("Missing restaurantCode");
  }

  const db = admin.database();
  const snap = await db
    .ref(`restaurants/${restaurantCode}/config/reputation`)
    .once("value");

  const data = snap.val() || {};

  if (!data || !data.active) {
    return {
      ok: true,
      enabled: false,
      reason: "Reputation config not active or missing",
    };
  }

  const uberEatsStoreUrl = String(data.uberEatsStoreUrl || "").trim();

  if (!uberEatsStoreUrl) {
    return {
      ok: true,
      enabled: false,
      reason: "Uber Eats not configured",
    };
  }

  return {
    ok: true,
    enabled: true,
    storeUrl: uberEatsStoreUrl,
    platform: "uber_eats",
    restaurantDisplayName: data.restaurantDisplayName || "",
    googlePlaceId: data.googlePlaceId || "",
    timeZone: data.timeZone || "",
  };
}

module.exports = {
  getUberEatsSource,
};