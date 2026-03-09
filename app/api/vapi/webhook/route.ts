// app/api/vapi/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

type AnyObj = Record<string, any>;

function asDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getField(...values: any[]) {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

function getNestedCallCandidate(body: AnyObj): AnyObj | null {
  if (!body || typeof body !== "object") return null;

  // Flat payload
  if (body.id && (body.assistantId || body.startedAt || body.startTime)) {
    return body;
  }

  // Common wrapped shapes
  if (body.call && typeof body.call === "object") return body.call;
  if (body.message?.call && typeof body.message.call === "object") return body.message.call;
  if (body.data?.call && typeof body.data.call === "object") return body.data.call;

  // Fallback wrappers
  if (body.message && typeof body.message === "object") return body.message;
  if (body.data && typeof body.data === "object") return body.data;

  return null;
}

function normalizeWebhookPayload(body: AnyObj) {
  const eventType =
    getField(body?.type, body?.message?.type, body?.data?.type) ?? null;

  const candidate = getNestedCallCandidate(body) ?? body;

  const id = getField(
    candidate?.id,
    candidate?.callId,
    body?.id,
    body?.callId,
    body?.message?.call?.id,
    body?.data?.call?.id
  );

  const assistantId = getField(
    candidate?.assistantId,
    candidate?.assistant?.id,
    body?.assistantId,
    body?.message?.assistantId,
    body?.message?.call?.assistantId,
    body?.data?.assistantId,
    body?.data?.call?.assistantId
  );

  const startedAtRaw = getField(
    candidate?.startedAt,
    candidate?.startTime,
    candidate?.createdAt,
    candidate?.call?.startedAt,
    body?.startedAt,
    body?.startTime,
    body?.message?.startedAt,
    body?.message?.call?.startedAt,
    body?.data?.startedAt,
    body?.data?.call?.startedAt
  );

  const endedAtRaw = getField(
    candidate?.endedAt,
    candidate?.endTime,
    candidate?.call?.endedAt,
    body?.endedAt,
    body?.endTime,
    body?.message?.endedAt,
    body?.message?.call?.endedAt,
    body?.data?.endedAt,
    body?.data?.call?.endedAt
  );

  const startedAt = asDate(startedAtRaw);
  const endedAt = asDate(endedAtRaw);

  const rawDuration = getField(
    candidate?.durationSeconds,
    candidate?.call?.durationSeconds,
    body?.durationSeconds,
    body?.message?.durationSeconds,
    body?.message?.call?.durationSeconds,
    body?.data?.durationSeconds,
    body?.data?.call?.durationSeconds
  );

  const durationSeconds =
    typeof rawDuration === "number"
      ? rawDuration
      : startedAt && endedAt
      ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000))
      : null;

  const from = getField(
    candidate?.customer?.number,
    candidate?.from,
    candidate?.call?.customer?.number,
    body?.customer?.number,
    body?.from,
    body?.message?.customer?.number,
    body?.message?.call?.customer?.number,
    body?.data?.customer?.number,
    body?.data?.call?.customer?.number
  );

  const to = getField(
    candidate?.to,
    candidate?.phoneNumber?.number,
    candidate?.call?.to,
    body?.to,
    body?.phoneNumber?.number,
    body?.message?.to,
    body?.message?.call?.to,
    body?.data?.to,
    body?.data?.call?.to
  );

  const status = getField(
    candidate?.status,
    candidate?.call?.status,
    body?.status,
    body?.message?.status,
    body?.message?.call?.status,
    body?.data?.status,
    body?.data?.call?.status
  );

  const endedReason = getField(
    candidate?.endedReason,
    candidate?.call?.endedReason,
    body?.endedReason,
    body?.message?.endedReason,
    body?.message?.call?.endedReason,
    body?.data?.endedReason,
    body?.data?.call?.endedReason
  );

  const recordingUrl = getField(
    candidate?.recordingUrl,
    candidate?.artifact?.recordingUrl,
    candidate?.media?.recordingUrl,
    candidate?.call?.recordingUrl,
    body?.recordingUrl,
    body?.artifact?.recordingUrl,
    body?.message?.recordingUrl,
    body?.message?.artifact?.recordingUrl,
    body?.message?.call?.recordingUrl,
    body?.data?.recordingUrl,
    body?.data?.artifact?.recordingUrl,
    body?.data?.call?.recordingUrl
  );

  const transcript = getField(
    candidate?.transcript,
    candidate?.artifact?.transcript,
    candidate?.analysis?.transcript,
    candidate?.call?.transcript,
    body?.transcript,
    body?.artifact?.transcript,
    body?.message?.transcript,
    body?.message?.artifact?.transcript,
    body?.message?.analysis?.transcript,
    body?.message?.call?.transcript,
    body?.data?.transcript,
    body?.data?.artifact?.transcript,
    body?.data?.analysis?.transcript,
    body?.data?.call?.transcript
  );

  const type = getField(
    candidate?.type,
    candidate?.call?.type,
    body?.type,
    body?.message?.type,
    body?.message?.call?.type,
    body?.data?.type,
    body?.data?.call?.type
  );

  return {
    id: id ? String(id) : null,
    assistantId: assistantId ? String(assistantId) : null,
    eventType: eventType ? String(eventType) : null,
    type: type ? String(type) : null,
    status: status ? String(status) : null,
    endedReason: endedReason ? String(endedReason) : null,
    from: from ? String(from) : null,
    to: to ? String(to) : null,
    startTime: startedAt,
    endTime: endedAt,
    callDate: startedAt,
    durationSeconds,
    recordingUrl: recordingUrl ? String(recordingUrl) : null,
    transcript: transcript ? String(transcript) : null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-vapi-secret");
    if (
      process.env.VAPI_WEBHOOK_SECRET &&
      secret !== process.env.VAPI_WEBHOOK_SECRET
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    console.log("VAPI WEBHOOK RAW:", JSON.stringify(body, null, 2));

    const normalized = normalizeWebhookPayload(body);

    if (!normalized.id || !normalized.assistantId) {
      console.error("VAPI WEBHOOK MISSING REQUIRED FIELDS", {
        parsedId: normalized.id,
        parsedAssistantId: normalized.assistantId,
        topLevelKeys: body && typeof body === "object" ? Object.keys(body) : [],
      });

      return NextResponse.json(
        {
          error: "Missing id or assistantId",
          parsed: {
            id: normalized.id,
            assistantId: normalized.assistantId,
            eventType: normalized.eventType,
          },
        },
        { status: 400 }
      );
    }

    const ref = adminDb.collection("callLogs").doc(normalized.id);
    const existing = await ref.get();

    const docData = {
      assistantId: normalized.assistantId,
      eventType: normalized.eventType,
      type: normalized.type,
      status: normalized.status,
      endedReason: normalized.endedReason,

      from: normalized.from,
      to: normalized.to,

      startTime: normalized.startTime,
      endTime: normalized.endTime,
      callDate: normalized.callDate,

      durationSeconds: normalized.durationSeconds,
      recordingUrl: normalized.recordingUrl,
      transcript: normalized.transcript,

      raw: body,
      updatedAt: new Date(),
      ...(existing.exists ? {} : { createdAt: new Date() }),
    };

    await ref.set(docData, { merge: true });

    console.log("VAPI WEBHOOK UPSERT OK:", {
      id: normalized.id,
      assistantId: normalized.assistantId,
      eventType: normalized.eventType,
      status: normalized.status,
    });

    return NextResponse.json(
      {
        ok: true,
        id: normalized.id,
        assistantId: normalized.assistantId,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message || "unknown error" },
      { status: 500 }
    );
  }
}