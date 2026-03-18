const {
  RESTAURANT_COMPLAINT_TAXONOMY,
} = require("./restaurantComplaintTaxonomy");

function normalizeText(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesPhrase(text, phrase) {
  return text.includes(normalizeText(phrase));
}

function hasNearbyNegation(text, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  const idx = text.indexOf(normalizedPhrase);
  if (idx === -1) return false;

  const start = Math.max(0, idx - 20);
  const prefix = text.slice(start, idx);

  return (
    prefix.includes("not ") ||
    prefix.includes("no ") ||
    prefix.includes("never ") ||
    prefix.includes("wasn't ") ||
    prefix.includes("wasnt ") ||
    prefix.includes("isn't ") ||
    prefix.includes("isnt ")
  );
}

function classifyRestaurantComplaintText(text, source = "other") {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const matches = [];

  for (const category of RESTAURANT_COMPLAINT_TAXONOMY) {
    for (const pattern of category.patterns) {
      const matchedKeyword = pattern.keywords.find((kw) => {
        if (!includesPhrase(normalized, kw)) return false;
        if (hasNearbyNegation(normalized, kw)) return false;
        return true;
      });

      if (!matchedKeyword) continue;

      matches.push({
        type: category.type,
        typeLabel: category.label,
        pattern: pattern.key,
        patternLabel: pattern.label,
        source,
        matchedKeyword,
      });
    }
  }

  const unique = [];
  const seen = new Set();

  for (const item of matches) {
    const key = `${item.type}__${item.pattern}__${item.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

module.exports = {
  classifyRestaurantComplaintText,
};