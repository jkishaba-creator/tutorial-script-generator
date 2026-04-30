import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getPromptsDB, buildFinalPrompt, computeTimingVars } from "@/lib/prompts-db";
import { formatDNAContext, countSteps } from "@/lib/architect";
import type { ArchitectDNA } from "@/lib/architect";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, minWordCount, maxWordCount, targetWordCount, instructions, presetId, architectDNA } = body as {
      title?: string;
      minWordCount?: number;
      maxWordCount?: number;
      targetWordCount?: number;
      instructions?: string;
      presetId?: string;
      architectDNA?: ArchitectDNA;
    };

    if (!title || !instructions || !minWordCount || !maxWordCount || !targetWordCount) {
      return NextResponse.json(
        { error: "Missing required fields: title, minWordCount, maxWordCount, targetWordCount, and instructions" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Count steps (still needed for backward compat with custom presets)
    const numberOfSteps = countSteps(instructions);
    const wordsPerStep = Math.floor(targetWordCount / numberOfSteps);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const wordCountRange = `${minWordCount}-${maxWordCount}`;
    
    const db = getPromptsDB();
    
    let preset = db.presets.find(p => p.id === presetId);
    if (!preset) {
      preset = db.presets.find(p => p.type === "solo" && p.isDefault) || db.presets[0];
    }

    const timingVars = computeTimingVars(targetWordCount, preset.wpm || 150, numberOfSteps);
    const basePrompt = buildFinalPrompt(preset, db.globalRules);

    // Format DNA context string (empty string if no DNA provided)
    const dnaContext = architectDNA ? formatDNAContext(architectDNA) : "";

    // Perform variable replacement
    const systemPrompt = basePrompt
      .replace(/\{\{DNA_CONTEXT\}\}/g, dnaContext)
      .replace(/\{\{TARGET_MINUTES\}\}/g, timingVars.TARGET_MINUTES)
      .replace(/\{\{WPM\}\}/g, timingVars.WPM)
      .replace(/\{\{SECONDS_PER_STEP\}\}/g, timingVars.SECONDS_PER_ITEM)
      .replace(/\{\{WORD_COUNT_RANGE\}\}/g, wordCountRange)
      .replace(/\{\{TARGET_WORD_COUNT\}\}/g, targetWordCount.toString())
      .replace(/\{\{NUMBER_OF_STEPS\}\}/g, numberOfSteps.toString())
      .replace(/\{\{WORDS_PER_STEP\}\}/g, wordsPerStep.toString())
      .replace(/\{\{TITLE\}\}/g, title)
      .replace(/\{\{INSTRUCTIONS\}\}/g, instructions);

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const script = response.text();

    return NextResponse.json({ script });
  } catch (error) {
    console.error("Error generating script:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate script. Please check your API key and try again.",
      },
      { status: 500 }
    );
  }
}
