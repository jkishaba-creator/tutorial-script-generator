import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getPromptsDB, buildFinalPrompt, computeTimingVars } from "@/lib/prompts-db";
import { formatDNAContext } from "@/lib/architect";
import type { ArchitectDNA } from "@/lib/architect";

type UseCaseInput = { taskName: string; instructions: string };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      softwareName,
      minWordCount,
      maxWordCount,
      targetWordCount,
      useCases,
    } = body as {
      title?: string;
      softwareName?: string;
      minWordCount?: number;
      maxWordCount?: number;
      targetWordCount?: number;
      useCases?: UseCaseInput[];
    };

    if (!title?.trim() || !softwareName?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: title and softwareName" },
        { status: 400 }
      );
    }

    if (
      typeof minWordCount !== "number" ||
      typeof maxWordCount !== "number" ||
      typeof targetWordCount !== "number"
    ) {
      return NextResponse.json(
        { error: "minWordCount, maxWordCount, and targetWordCount must be numbers" },
        { status: 400 }
      );
    }

    if (!Array.isArray(useCases) || useCases.length < 2 || useCases.length > 8) {
      return NextResponse.json(
        { error: "useCases must be an array with 2 to 8 items" },
        { status: 400 }
      );
    }

    const invalid = useCases.find(
      (u) => typeof u?.taskName !== "string" || typeof u?.instructions !== "string"
    );
    if (invalid) {
      return NextResponse.json(
        { error: "Each use case must have taskName and instructions (strings)" },
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

    const numberOfUseCases = useCases.length;
    const wordsPerUseCase = Math.floor(targetWordCount / numberOfUseCases);
    const names = useCases.map((u) => u.taskName.trim());
    const taskNamesList =
      names.length <= 1
        ? names[0] ?? ""
        : names.length === 2
          ? `${names[0]} and ${names[1]}`
          : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;

    const dataBlockLines = useCases.map(
      (u) => `Task: ${u.taskName.trim()}\nInstructions:\n${u.instructions.trim()}`
    );
    const dataBlock = dataBlockLines.join("\n\n---\n\n");
    
    const db = getPromptsDB();
    const presetId = body.presetId;
    
    let preset = db.presets.find(p => p.id === presetId);
    if (!preset) {
      preset = db.presets.find(p => p.type === "masterclass" && p.isDefault) || db.presets[1];
    }

    const timingVars = computeTimingVars(targetWordCount, preset.wpm || 150, numberOfUseCases);
    const basePrompt = buildFinalPrompt(preset, db.globalRules);

    // Format DNA context string
    const dna = body.architectDNA as ArchitectDNA | undefined;
    const dnaContext = dna ? formatDNAContext(dna) : "";

    const systemPrompt = basePrompt
      .replace(/\{\{DNA_CONTEXT\}\}/g, dnaContext)
      .replace(/\{\{TARGET_MINUTES\}\}/g, timingVars.TARGET_MINUTES)
      .replace(/\{\{WPM\}\}/g, timingVars.WPM)
      .replace(/\{\{SECONDS_PER_USE_CASE\}\}/g, timingVars.SECONDS_PER_ITEM)
      .replace(/\{\{WORDS_PER_USE_CASE\}\}/g, wordsPerUseCase.toString())
      .replace(/\{\{MIN_WORD_COUNT\}\}/g, minWordCount.toString())
      .replace(/\{\{MAX_WORD_COUNT\}\}/g, maxWordCount.toString())
      .replace(/\{\{TARGET_WORD_COUNT\}\}/g, targetWordCount.toString())
      .replace(/\{\{NUMBER_OF_USE_CASES\}\}/g, numberOfUseCases.toString())
      .replace(/\{\{SOFTWARE_NAME\}\}/g, softwareName.trim())
      .replace(/\{\{TASK_NAMES_LIST\}\}/g, taskNamesList)
      .replace(/\{\{TITLE\}\}/g, title.trim())
      .replace(/\{\{DATA_BLOCK\}\}/g, dataBlock);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const script = response.text();

    return NextResponse.json({ script });
  } catch (error) {
    console.error("Error generating masterclass script:", error);
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
