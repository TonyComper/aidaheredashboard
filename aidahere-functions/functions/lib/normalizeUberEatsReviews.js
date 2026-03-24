// functions/lib/normalizeUberEatsReviews.js

function parseUberEatsDate(dateValue) {
  try {
    const raw = Array.isArray(dateValue) ? dateValue[0] : dateValue;
    if (!raw || typeof raw !== "string") return null;

    // expected format: "25-07-17" => YY-MM-DD
    const parts = raw.split("-");
    if (parts.length !== 3) return null;

    const yy = Number(parts[0]);
    const mm = Number(parts[1]);
    const dd = Number(parts[2]);

    if (!yy || !mm || !dd) return null;

    const fullYear = yy >= 70 ? 1900 + yy : 2000 + yy;
    const iso = new Date(Date.UTC(fullYear, mm - 1, dd)).toISOString();

    return iso;
  } catch (err) {
    return null;
  }
}

function normalizeUberEatsReviews(rawItems, restaurantCode) {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((item, index) => {
      const text = String(item?.text || "").trim();
      const authorName = String(item?.authorName || "").trim();
      const createdAt = parseUberEatsDate(item?.date);
      const placeInfo = item?.placeInfo || {};

      return {
        source: "uber_eats",
        sourceType: "review",
        platform: "uber_eats",

        restaurantCode,

        externalReviewId:
          `${restaurantCode}_uber_${placeInfo?.id?.[0] || "store"}_${index}`,

        authorName: authorName || null,
        text,
        originalText: text,

        rating: null, // Uber Eats actor did not return per-review star rating
        overallStoreRating:
          typeof placeInfo?.rating === "number" ? placeInfo.rating : null,

        createdAt,
        createdAtMs: createdAt ? new Date(createdAt).getTime() : null,

        storeId: Array.isArray(placeInfo?.id) ? placeInfo.id[0] || null : null,
        storeUrl: placeInfo?.url || null,
        storeName: placeInfo?.name || null,
        storeAddress: placeInfo?.address || null,
        totalStoreReviews:
          typeof placeInfo?.numberOfReviews === "number"
            ? placeInfo.numberOfReviews
            : null,

        raw: item,
      };
    })
    .filter((item) => item.text);
}

module.exports = {
  normalizeUberEatsReviews,
};