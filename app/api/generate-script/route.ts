import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

// Function to count the number of steps in instructions
function countSteps(instructions: string): number {
  // Count <li> tags (case insensitive)
  const liMatches = instructions.match(/<li[^>]*>/gi);
  const liCount = liMatches ? liMatches.length : 0;
  
  // Count numbered steps (e.g., "1.", "2.", "Step 1:", etc.)
  const numberedSteps = instructions.match(/\d+[\.\)]\s|Step\s+\d+/gi);
  const numberedCount = numberedSteps ? numberedSteps.length : 0;
  
  // Count lines that look like steps (non-empty lines after stripping HTML)
  const strippedHtml = instructions.replace(/<[^>]+>/g, '');
  const lines = strippedHtml.split('\n').filter(line => line.trim().length > 0);
  
  // Use the highest count, but ensure at least 1 step
  const stepCount = Math.max(liCount, numberedCount, lines.length > 1 ? lines.length : 1);
  
  return Math.max(stepCount, 1); // Ensure at least 1 step
}

export async function POST(request: NextRequest) {
  try {
    const { title, minWordCount, maxWordCount, targetWordCount, instructions } = await request.json();

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

    // Count steps and calculate words per step
    const numberOfSteps = countSteps(instructions);
    const wordsPerStep = Math.floor(targetWordCount / numberOfSteps);

    const genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-2.5-flash for better performance and cost-effectiveness
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const wordCountRange = `${minWordCount}-${maxWordCount}`;
    
    const systemPrompt = `Take the following step-by-step instructions and transform them into a detailed, natural-sounding script when read aloud. Your script must be approximately ${wordCountRange} words long (target: ${targetWordCount} words). There are ${numberOfSteps} steps in the instructions, so you should allocate approximately ${wordsPerStep} words per step. The script should be easy to follow, instructional, and conversational, with a focus on clarity and thoroughness. Make sure to provide explanations, context, and additional tips where necessary to enhance understanding, but do not add any new steps. The script should be well-structured and flow naturally for an AI voiceover. Do not add step numbers or anything other than the script which should be read. You must remove sensitive info such as names, emails, passwords, API keys, phone numbers, etc., from your script. It should start with 'In today's video, I'm going to teach you ${title}.' Please do not add weird rhetorical questions or random stuff that deviates from the intention of the script/video. The voice-over length when read aloud is written after the title; please ensure it meets it or is slightly longer, and take into account that this will be read at about 190 words per minute. You must NOT include bullet points or Bold text in your answer, as those aren't generally found on scripts. IMPORTANT: Strictly adhere to the word count target of ${targetWordCount} words. Do not exceed this limit significantly.

The video title, length, and step-by-step instructions are below: video title: ${title} length: ${targetWordCount} words (approximately ${wordsPerStep} words per step) step-by-step-instructions: ${instructions}`;

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
