import { NextResponse } from "next/server";

/** Debug route: returns whether env vars are present (no values exposed). */
export async function GET() {
  return NextResponse.json({
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: !!process.env.ELEVENLABS_VOICE_ID,
  });
}
