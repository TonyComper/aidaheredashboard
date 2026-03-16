// app/api/vapi/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

type AnyObj = Record<string, any>;

function asDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clip(value: any, max = 20000): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

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
    recordingUrl: recordingUrl ? String(recordingUrl) : null,
    transcript: clip(transcript, 20000), // avoid giant docs

    // no raw payload in bulk sync
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

function classifyTranscript(transcript: string | null) {
  const text = (transcript || "").toLowerCase().trim();

  if (!text) {
    return {
      callType: "other",
      containsComplaint: false,
      matchedPhrases: [] as string[],
      transcriptPreview: "",
    };
  }

  const strongComplaintPhrases = [
    "food was cold",
    "order was cold",
    "my order is late",
    "order is late",
    "wrong order",
    "missing item",
    "missing items",
    "forgot my",
    "want a refund",
    "need a refund",
    "bad service",
    "rude staff",
    "i have a complaint",
    "this is a complaint",
  ];

  const weakComplaintPhrases = [
    "cold",
    "late",
    "missing",
    "forgot",
    "refund",
    "problem",
    "not happy",
    "disappointed",
    "rude",
  ];

  const strongMatches = strongComplaintPhrases.filter((phrase) => text.includes(phrase));
  const weakMatches = weakComplaintPhrases.filter((phrase) => text.includes(phrase));

  const containsComplaint =
    strongMatches.length > 0 || weakMatches.length >= 2;

  const matchedPhrases = [...strongMatches, ...weakMatches];

  const isOrder =
    text.includes("i'd like to order") ||
    text.includes("i would like to order") ||
    text.includes("place an order") ||
    text.includes("pickup order") ||
    text.includes("pick up order") ||
    text.includes("for pickup") ||
    text.includes("for delivery");

  const isManagerRequest =
    text.includes("speak to the manager") ||
    text.includes("speak to a manager");

  const isOwnerRequest =
    text.includes("speak to the owner");

  let callType = "other";

  if (containsComplaint) {
    callType = "complaint";
  } else if (isOrder) {
    callType = "order";
  } else if (isManagerRequest) {
    callType = "manager_request";
  } else if (isOwnerRequest) {
    callType = "owner_request";
  }

  return {
    callType,
    containsComplaint,
    matchedPhrases,
    transcriptPreview: transcript ? transcript.slice(0, 500) : "",
  };
}

async function getRestaurantCodeForAssistant(assistantId: string | null) {
  if (!assistantId) return null;

  const snap = await adminDb.ref(`restaurants`).get();
  const restaurants = snap.val() || {};

  for (const [restaurantCode, data] of Object.entries(restaurants)) {
    const cfg = (data as any)?.config || {};
    if (cfg?.assistantId === assistantId) {
      return String(restaurantCode);
    }
  }

  return null;
}

async function writeInChunks(rows: any[], chunkSize = 50) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const batch = adminDb.batch();

    for (const r of chunk) {
      const ref = adminDb.collection("callLogs").doc(String(r.id));
      batch.set(ref, r, { merge: true });

      const analysis = classifyTranscript(r.transcript || null);
      const analysisRef = ref.collection("analysis").doc("latest");

      batch.set(
        analysisRef,
        {
          ...analysis,
          createdAt: new Date(),
        },
        { merge: true }
      );
    }

    await batch.commit();

    for (const r of chunk) {
      const analysis = classifyTranscript(r.transcript || null);

      if (analysis.containsComplaint) {
        const restaurantCode = await getRestaurantCodeForAssistant(
          String(r.assistantId || "")
        );

        if (restaurantCode) {
          await adminDb
            .ref(`restaurants/${restaurantCode}/reputationSignals/voiceComplaints/items/${String(r.id)}`)
            .update({
              source: "voice",
              channel: "phone",
              category: analysis.callType,
              severity: "medium",
              text: r.transcript || "",
              customerName: "",
              phone: r.from || "",
              dateMs: r.startTime ? r.startTime.getTime() : Date.now(),
              relatedOrderId: "",
              tags: analysis.matchedPhrases,
              restaurantCode,
              callId: String(r.id),
              assistantId: String(r.assistantId || ""),
              createdAtMs: Date.now(),
            });
        }
      }
    }
  }
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

    const callsQS = new URLSearchParams();
    callsQS.set("limit", "200");
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
    console.log("VAPI CALLS TOP-LEVEL KEYS:", payload && typeof payload === "object" ? Object.keys(payload) : []);
    const apiItems = pickItems(payload);
    console.log("VAPI CALLS ITEM COUNT:", apiItems.length);

    const startDate = start ? asDate(start) : null;
    const endDate = end ? asDate(end) : null;

    let rows = apiItems
      .map((x) => toCallRow(x, assistantId))
      .filter((r) => !!r.id);

    rows = rows.filter((r) => r.assistantId === assistantId);

    if (startDate) {
      rows = rows.filter((r) => r.startTime && r.startTime >= startDate);
    }
    if (endDate) {
      rows = rows.filter((r) => r.startTime && r.startTime <= endDate);
    }

    console.log("SYNC ROW COUNT AFTER LOCAL FILTER:", rows.length);

    if (rows.length > 0) {
      await writeInChunks(rows, 50);
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