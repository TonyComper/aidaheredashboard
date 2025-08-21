// app/api/vapi/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Expected incoming JSON (example):
 * {
 *   "id": "5711f8ab-2f9f-4890-b09c-782588c7c4a0",
 *   "assistantId": "0923a8dd-bb36-4e4b-ab3a-59f4e5d1a81a",
 *   "type": "inboundPhoneCall",
 *   "startedAt": "2025-08-20T16:36:17.035Z",
 *   "endedAt": "2025-08-20T16:37:26.669Z",
 *   "durationSeconds": 69,
 *   "status": "ended",
 *   "endedReason": "customer-ended-call",
 *   "customer": { "number": "+16478306349" },
 *   "recordingUrl": "https://storage.vapi.ai/....wav",
 *   "transcript": "AI: ...\nUser: ...\n"
 * }
 */

export async function POST(req: NextRequest) {
  try {
    // (Optional) simple shared-secret check
    const secret = req.headers.get("x-vapi-secret");
    if (process.env.VAPI_WEBHOOK_SECRET && secret !== process.env.VAPI_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Basic normalization
    const id: string | undefined = body?.id;
    const assistantId: string | undefined = body?.assistantId;
    if (!id || !assistantId) {
      return NextResponse.json({ error: "Missing id or assistantId" }, { status: 400 });
    }

    const startedAtISO: string | null =
      body?.startedAt ?? body?.startTime ?? null;
    const endedAtISO: string | null =
      body?.endedAt ?? body?.endTime ?? null;

    const durationSeconds: number | null =
      typeof body?.durationSeconds === "number"
        ? body.durationSeconds
        : body?.startedAt && body?.endedAt
        ? Math.max(0, Math.floor((+new Date(body.endedAt) - +new Date(body.startedAt)) / 1000))
        : null;

    const docData = {
      assistantId,
      type: body?.type ?? null,
      status: body?.status ?? null,
      endedReason: body?.endedReason ?? null,

      // phone numbers
      from: body?.customer?.number ?? body?.from ?? null,
      to: body?.to ?? null,

      // times
      startTime: startedAtISO ? new Date(startedAtISO) : null,
      endTime: endedAtISO ? new Date(endedAtISO) : null,
      callDate: startedAtISO ? new Date(startedAtISO) : null,

      // metrics & media
      durationSeconds,
      recordingUrl: body?.recordingUrl ?? null,
      transcript: body?.transcript ?? null,

      // bookkeeping
      raw: body, // keep full payload for debugging
      updatedAt: new Date(),
      createdAt: new Date(),
    };

    // Upsert by Vapi call id so repeats overwrite
    await adminDb.collection("callLogs").doc(id).set(docData, { merge: true });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Server error", details: err?.message }, { status: 500 });
  }
}
