// app/api/vapi/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

type AnyObj = Record<string, any>;

function asDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize one Vapi call object into our Firestore shape */
function toCallRow(x: AnyObj, assistantIdFallback: string) {
  const id = x?.id ?? x?.callId ?? null;

  const startedAtRaw =
    x?.startedAt ??
    x?.startTime ??
    x?.createdAt ??
    x?.message?.startedAt ??
    x?.call?.startedAt ??
    null;

  const endedAtRaw =
    x?.endedAt ??
    x?.endTime ??
    x?.message?.endedAt ??
    x?.call?.endedAt ??
    null;

  const startedAt = asDate(startedAtRaw);
  const endedAt = asDate(endedAtRaw);

  const assistantId =
    x?.assistantId ??
    x?.assistant?.id ??
    x?.call?.assistantId ??
    x?.message?.assistantId ??
    assistantIdFallback;

  const from =
    x?.customer?.number ??
    x?.from ??
    x?.phoneNumber?.number ??
    x?.call?.customer?.number ??
    x?.message?.customer?.number ??
    null;

  const to =
    x?.to ??
    x?.phoneNumber?.number ??
    x?.call?.to ??
    x?.message?.to ??
    null;

  const durationSeconds =
    typeof x?.durationSeconds === "number"
      ? x.durationSeconds
      : startedAt && endedAt
      ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000))
      : null;

  const recordingUrl =
    x?.recordingUrl ??
    x?.artifact?.recordingUrl ??
    x?.media?.recordingUrl ??
    x?.message?.artifact?.recordingUrl ??
    null;

  const transcript =
    x?.transcript ??
    x?.artifact?.transcript ??
    x?.analysis?.transcript ??
    x?.message?.artifact?.transcript ??
    x?.message?.analysis?.transcript ??
    null;

  return {
    id,
    assistantId,
    type: x?.type ?? x?.call?.type ?? null,
    status: x?.status ?? x?.call?.status ?? null,
    endedReason: x?.endedReason ?? x?.message?.endedReason ?? x?.call?.endedReason ?? null,

    from,
    to,

    startTime: startedAt,
    endTime: endedAt,
    callDate: startedAt,

    durationSeconds,
    recordingUrl,
    transcript,

    raw: x,
    updatedAt: new Date(),
    createdAt: new Date(),
  };
}

function pickItems(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.calls)) return payload.calls;
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assistantId = searchParams.get("assistantId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!assistantId) {
      return NextResponse.json({ error: "assistantId required" }, { status: 400 });
    }

    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "VAPI_API_KEY missing" }, { status: 500 });
    }

    // Current Vapi Calls API
    const callsQS = new URLSearchParams();
    callsQS.set("limit", "200");

    // Keep these for compatibility with your prior implementation.
    // If Vapi ignores them, we'll still filter locally below.
    callsQS.set("assistantId", assistantId);
    if (start) callsQS.set("createdAtGe", start);
    if (end) callsQS.set("createdAtLe", end);

    const callsUrl = `https://api.vapi.ai/call?${callsQS.toString()}`;

    const callsRes = await fetch(callsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!callsRes.ok) {
      const text = await callsRes.text().catch(() => "");
      console.error("VAPI CALLS ERROR STATUS:", callsRes.status);
      console.error("VAPI CALLS ERROR URL:", callsUrl);
      console.error("VAPI CALLS ERROR BODY:", text);

      return NextResponse.json(
        { error: "Failed to fetch calls from Vapi", status: callsRes.status, body: text },
        { status: 502 }
      );
    }

    const payload = await callsRes.json().catch(() => ({}));

    console.log("VAPI CALLS URL:", callsUrl);
    console.log("VAPI CALLS RAW:", JSON.stringify(payload, null, 2));

    const apiItems = pickItems(payload);
    console.log("VAPI CALLS ITEM COUNT:", apiItems.length);

    const startDate = start ? asDate(start) : null;
    const endDate = end ? asDate(end) : null;

    // Normalize first
    let rows = apiItems
      .map((x) => toCallRow(x, assistantId))
      .filter((r) => !!r.id);

    // Filter locally as a safety net in case Vapi ignores query params
    rows = rows.filter((r) => r.assistantId === assistantId);

    if (startDate) {
      rows = rows.filter((r) => r.startTime && r.startTime >= startDate);
    }
    if (endDate) {
      rows = rows.filter((r) => r.startTime && r.startTime <= endDate);
    }

    console.log("SYNC ROW COUNT AFTER LOCAL FILTER:", rows.length);

    if (rows.length > 0) {
      const batch = adminDb.batch();
      for (const r of rows) {
        const ref = adminDb.collection("callLogs").doc(String(r.id));
        batch.set(ref, r, { merge: true });
      }
      await batch.commit();
    }

    return NextResponse.json(
      {
        ok: true,
        fetched: apiItems.length,
        upserted: rows.length,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("SYNC ROUTE ERROR:", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "server error" },
      { status: 500 }
    );
  }
}