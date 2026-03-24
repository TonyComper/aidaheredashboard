// functions/lib/waitForApifyRun.js

async function waitForApifyRun(runId, options = {}) {
  const token = process.env.APIFY_TOKEN;

  if (!token) {
    throw new Error("Missing APIFY_TOKEN in functions/.env");
  }

  if (!runId) {
    throw new Error("Missing runId");
  }

  const timeoutMs = options.timeoutMs || 120000;
  const intervalMs = options.intervalMs || 3000;

  const startedAt = Date.now();

  while (true) {
    const url =
      `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}` +
      `?token=${encodeURIComponent(token)}`;

    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Apify run status fetch failed: ${response.status} ${response.statusText} - ${text}`
      );
    }

    const payload = await response.json();
    const run = payload?.data || {};
    const status = String(run.status || "").toUpperCase();

    if (status === "SUCCEEDED") {
      return {
        runId: run.id || runId,
        datasetId: run.defaultDatasetId || null,
        status,
        raw: run,
      };
    }

    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      throw new Error(`Apify run ended with status: ${status}`);
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for Apify run to finish: ${runId}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

module.exports = {
  waitForApifyRun,
};