import { NextResponse } from "next/server";

/** Debug route: returns whether env vars are present (no values exposed). */
export async function GET() {
  return NextResponse.json({
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: !!process.env.ELEVENLABS_VOICE_ID,
    GOOGLE_SERVICE_ACCOUNT_JSON: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    SA_PROJECT_ID: getProjectId(),
  });
}

function getProjectId() {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
    const decoded = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
    return JSON.parse(decoded).project_id;
  } catch {
    return "error parsing json";
  }
}
