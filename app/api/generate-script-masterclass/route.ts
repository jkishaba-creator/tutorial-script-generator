import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

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

    const systemPrompt = `Take the following multi-use-case instructions and transform them into a detailed, natural-sounding masterclass script when read aloud. Your script must be approximately ${minWordCount}-${maxWordCount} words long (target: ${targetWordCount} words). There are ${numberOfUseCases} distinct use cases to cover. To ensure the script stays within the target length, you should allocate approximately ${wordsPerUseCase} words per use case. Each use case contains a set of step-by-step instructions; please synthesize these steps into a fluid, conversational explanation that fits within the allocated word count for that specific use case. The script should be easy to follow, instructional, and conversational, with a focus on clarity and thoroughness. Make sure to provide explanations, context, and additional tips where necessary to enhance understanding, but do not add any new steps or use cases. The script should be well-structured and flow naturally for an AI voiceover. Do not add step numbers or anything other than the script which should be read. You must remove sensitive info such as names, emails, passwords, API keys, phone numbers, etc., from your script.

Start the script EXACTLY with this phrasing, filling in the dynamically generated list of use cases: 'In today's video, I'm going to show you the best use cases for ${softwareName.trim()}. We're going to go over how to ${taskNamesList}.' Do NOT output a title line or a word count / voice-over length line at the top—output only the script to be read aloud, starting with that opening line. Ensure the script meets or slightly exceeds the target word count when read aloud (about 190 words per minute). Please do not add weird rhetorical questions or random stuff that deviates from the intention of the script/video. You must NOT include bullet points or Bold text in your answer, as those aren't generally found on scripts. The structure of the script should follow this repeating order for every use case provided:
'The [first/next/final] use case I'm going to teach you is how to [Task Name]' [Task Instructions]

Here is the data for this video: Software Name: ${softwareName.trim()} Video Title: ${title.trim()} Target Length: ${targetWordCount} words

${dataBlock}`;

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
