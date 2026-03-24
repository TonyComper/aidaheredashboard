// functions/lib/getApifyDatasetItems.js

async function getApifyDatasetItems(datasetId) {
  if (!datasetId) {
    throw new Error("Missing datasetId");
  }

  const token = process.env.APIFY_TOKEN;

  if (!token) {
    throw new Error("Missing APIFY_TOKEN in functions/.env");
  }

  const url =
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}` +
    `/items?clean=true&token=${encodeURIComponent(token)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Apify dataset fetch failed: ${response.status} ${response.statusText} - ${text}`
    );
  }

  const items = await response.json();
  return Array.isArray(items) ? items : [];
}

module.exports = {
  getApifyDatasetItems,
};