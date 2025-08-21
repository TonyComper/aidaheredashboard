// app/api/vapi/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/** Normalize a Vapi log/call object into our Firestore shape */
function toCallRow(x: any, assistantIdFallback: string) {
  // Call-like fields can come from Logs (x.requestBody/responseBody) or Calls
  const id = x.callId || x.id;
  const startedAt =
    x.startedAt ??
    x.startTime ??
    x.requestStartedAt ??
    x.createdAt ??
    x.requestBody?.startedAt ??
    null;
  const endedAt =
    x.endedAt ??
    x.endTime ??
    x.requestFinishedAt ??
    x.responseBody?.endedAt ??
    null;

  const from =
    x.customer?.number ??
    x.from ??
    x.requestBody?.customer?.number ??
    null;

  const to =
    x.to ??
    x.requestBody?.to ??
    x.phoneNumber?.number ??
    null;

  const durationSeconds =
    typeof x.durationSeconds === "number"
      ? x.durationSeconds
      : startedAt && endedAt
      ? Math.max(0, Math.floor((+new Date(endedAt) - +new Date(startedAt)) / 1000))
      : null;

  const recordingUrl =
    x.recordingUrl ??
    x.responseBody?.recordingUrl ??
    x.media?.recordingUrl ??
    null;

  const transcript =
    x.transcript ??
    x.responseBody?.transcript ??
    x.analysis?.transcript ??
    null;

  return {
    id,
    assistantId: x.assistantId ?? x.parentId ?? assistantIdFallback,
    status: x.status ?? null,
    endedReason: x.endedReason ?? null,

    from,
    to,

    startTime: startedAt ? new Date(startedAt) : null,
    endTime: endedAt ? new Date(endedAt) : null,
    callDate: startedAt ? new Date(startedAt) : null,

    durationSeconds,
    recordingUrl,
    transcript,

    raw: x,
    updatedAt: new Date(),
    createdAt: new Date(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assistantId = searchParams.get("assistantId");
    const start = searchParams.get("start"); // ISO optional
    const end = searchParams.get("end");     // ISO optional
    if (!assistantId) {
      return NextResponse.json({ error: "assistantId required" }, { status: 400 });
    }

    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "VAPI_API_KEY missing" }, { status: 500 });
    }

    // ---------- 1) Try GET /logs (deprecated but documented) ----------
    const logsQS = new URLSearchParams();
    logsQS.set("type", "Call");
    logsQS.set("assistantId", assistantId);
    logsQS.set("limit", "200");
    logsQS.set("sortOrder", "DESC");
    if (start) logsQS.set("createdAtGe", start);
    if (end)   logsQS.set("createdAtLe", end);

    const logsUrl = `https://api.vapi.ai/logs?${logsQS.toString()}`;
    const logsRes = await fetch(logsUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let rows: any[] = [];
    if (logsRes.ok) {
      const logsData = await logsRes.json().catch(() => ({}));
      const logItems: any[] = Array.isArray(logsData?.results) ? logsData.results : [];
      rows = logItems
        .filter((x) => x.callId || x.id) // only items related to calls
        .map((x) => toCallRow(x, assistantId));
    } else {
      const t = await logsRes.text().catch(() => "");
      console.error("VAPI LOGS ERROR", logsRes.status, logsUrl, t);
    }

    // ---------- 2) Fallback: GET /call (List Calls) if logs returned 0 ----------
    if (rows.length === 0) {
      const callsQS = new URLSearchParams();
      callsQS.set("assistantId", assistantId);
      callsQS.set("limit", "200");
      if (start) callsQS.set("createdAtGe", start);
      if (end)   callsQS.set("createdAtLe", end);

      const callsUrl = `https://api.vapi.ai/call?${callsQS.toString()}`;
      const callsRes = await fetch(callsUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!callsRes.ok) {
        const t = await callsRes.text().catch(() => "");
        console.error("VAPI CALLS ERROR", callsRes.status, callsUrl, t);
      } else {
        const calls = await callsRes.json().catch(() => ({}));
        const items: any[] = Array.isArray(calls?.results) ? calls.results : Array.isArray(calls) ? calls : [];
        rows = items
          .filter((x) => x.id)
          .map((x) => toCallRow(x, assistantId));
      }
    }

    // ---------- Upsert into Firestore ----------
    if (rows.length) {
      const batch = adminDb.batch();
      for (const r of rows) {
        const ref = adminDb.collection("callLogs").doc(r.id);
        batch.set(ref, r, { merge: true });
      }
      await batch.commit();
    }

    return NextResponse.json({ upserted: rows.length }, { status: 200 });
  } catch (e: any) {
    console.error("SYNC ROUTE ERROR", e?.message || e);
    return NextResponse.json({ error: e?.message || "server error" }, { status: 500 });
  }
}
