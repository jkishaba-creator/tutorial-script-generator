import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Parses instructions (HTML or plain text) to accurately count the number of steps.
 */
export function countSteps(instructions: string): number {
  // Count <li> tags (case insensitive)
  const liMatches = instructions.match(/<li[^>]*>/gi);
  const liCount = liMatches ? liMatches.length : 0;
  
  // Count numbered steps (e.g., "1.", "2.", "Step 1:", etc.)
  const numberedSteps = instructions.match(/\d+[\.\\)]\s|Step\s+\d+/gi);
  const numberedCount = numberedSteps ? numberedSteps.length : 0;
  
  // Count lines that look like steps (non-empty lines after stripping HTML)
  const strippedHtml = instructions.replace(/<[^>]+>/g, '');
  const lines = strippedHtml.split('\n').filter(line => line.trim().length > 0);
  
  // Use the highest count, but ensure at least 1 step
  const stepCount = Math.max(liCount, numberedCount, lines.length > 1 ? lines.length : 1);
  
  return Math.max(stepCount, 1); // Ensure at least 1 step
}

// ─── Architect DNA Schema ────────────────────────────────────────────────────

export interface StepTiming {
  name: string;
  allocatedSeconds: number;
  complexity: "simple" | "moderate" | "complex";
  transitionHint: string;
}

export interface ArchitectDNA {
  painPoint: string;
  authorityAnchor: string;
  coreTransformation: string;
  hookStyle: "result-led" | "experience-led" | "problem-led";
  hookDraft: string;
  bridgeDraft: string;
  timingMap: {
    hookSeconds: number;
    bridgeSeconds: number;
    steps: StepTiming[];
    closingSeconds: number;
  };
}

export interface ArchitectInput {
  title: string;
  instructions: string;       // raw step-by-step (Solo) or serialized use cases (Masterclass)
  targetWordCount: number;
  wpm: number;
  numberOfItems: number;       // steps (Solo) or use cases (Masterclass)
  itemLabel?: string;          // "step" or "use case" — for prompt phrasing
}

// ─── In-Memory LRU Cache ─────────────────────────────────────────────────────

interface CacheEntry {
  dna: ArchitectDNA;
  timestamp: number;
}

const architectCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 50;

function getCacheKey(input: ArchitectInput): string {
  const raw = `${input.title}|${input.instructions}|${input.targetWordCount}|${input.wpm}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function getCached(key: string): ArchitectDNA | null {
  const entry = architectCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    architectCache.delete(key);
    return null;
  }
  return entry.dna;
}

function setCache(key: string, dna: ArchitectDNA): void {
  // Evict oldest if at capacity
  if (architectCache.size >= MAX_CACHE_SIZE) {
    const oldest = architectCache.keys().next().value;
    if (oldest) architectCache.delete(oldest);
  }
  architectCache.set(key, { dna, timestamp: Date.now() });
}

// ─── The Architect System Prompt ─────────────────────────────────────────────

function buildArchitectPrompt(input: ArchitectInput): string {
  const totalSeconds = Math.round((input.targetWordCount / input.wpm) * 60);
  const label = input.itemLabel || "step";
  const labelPlural = label + "s";

  return `You are a YouTube tutorial strategist. Your job is to analyze raw tutorial content and extract its strategic "DNA" — the elements that make a viewer click, stay, and watch to the end.

You will receive a video title and ${label}-by-${label} instructions. Analyze them and return a JSON object with the following structure. Return ONLY valid JSON, no markdown fences, no explanation.

**Analysis Instructions:**

1. **Pain Point**: What specific frustration would make someone search for this video? Be concrete, not generic. Bad: "They don't know how to use the software." Good: "Their output sounds robotic and generic because they're using default settings."

2. **Authority Anchor**: What element in the title or instructions implies the creator has credibility? Look for: personal experience markers, specific results, quantity of research, community demand. If nothing explicit exists, suggest a natural one based on the content depth.

3. **Core Transformation**: What is the viewer's state BEFORE vs AFTER watching? Frame it as a transformation. Example: "From struggling with flat, lifeless audio → to producing professional-quality tracks with dynamic range."

4. **Hook Style**: Choose the best hook approach (Proof Type) for this specific content:
   - "result-led": Proof by leading with a specific, undeniable result before explaining the video. (e.g., "We spent $1.2M...")
   - "experience-led": Proof by highlighting the creator's authority, client success, or sheer volume of research.
   - "problem-led": Proof by aggressively calling out a highly specific, painful problem they've suffered from.

5. **Hook Draft (Proof + Promise)**: Write a strict maximum of 35 words. NEVER use greetings like "Hey everyone", "Welcome", or "In this video". Start immediately with the Proof (the pattern interrupt) based on the chosen Hook Style. Consider framing the opening as a direct, engaging question to the viewer (e.g., "Do you want to...?" or "Are you tired of...?"). Then immediately state the Promise (the Dream Outcome). It must be fast, punchy, and instantly valuable.

6. **Bridge Draft (The Plan)**: Write 1-2 sentences that act as the roadmap. This transitions from the high-energy Hook to the instructional body by briefly outlining the steps. Must be speakable in about 10 seconds (~25 words).

7. **Timing Map**: The total video duration is approximately ${totalSeconds} seconds (${input.targetWordCount} words at ${input.wpm} WPM). There are ${input.numberOfItems} ${labelPlural}. Allocate time intelligently:
   - Hook: 15-25 seconds
   - Bridge: 8-15 seconds
   - Each ${label}: Analyze complexity. A simple "click this button" ${label} gets less time. A complex multi-part ${label} gets more. The total must add up to approximately ${totalSeconds} seconds.
   - Closing: 15-20 seconds
   - For each ${label}, provide:
     - "name": A short descriptive name derived from the instructions
     - "allocatedSeconds": How many seconds this ${label} should take
     - "complexity": "simple", "moderate", or "complex"
     - "transitionHint": A brief note on how to bridge INTO this ${label} from the previous one (e.g., "contrast", "build on previous", "new topic", "continuation")

**Required JSON Schema:**
{
  "painPoint": "string",
  "authorityAnchor": "string",
  "coreTransformation": "string",
  "hookStyle": "result-led" | "experience-led" | "problem-led",
  "hookDraft": "string (strict max 35 words, NO greetings)",
  "bridgeDraft": "string (1-2 sentences, about 25 words)",
  "timingMap": {
    "hookSeconds": number,
    "bridgeSeconds": number,
    "steps": [
      {
        "name": "string",
        "allocatedSeconds": number,
        "complexity": "simple" | "moderate" | "complex",
        "transitionHint": "string"
      }
    ],
    "closingSeconds": number
  }
}

**Video Title:** ${input.title}

**Target Duration:** ~${totalSeconds} seconds (${input.targetWordCount} words at ${input.wpm} WPM)

**${labelPlural.charAt(0).toUpperCase() + labelPlural.slice(1)} (${input.numberOfItems} total):**
${input.instructions}`;
}

// ─── Run Architect ───────────────────────────────────────────────────────────

export async function runArchitect(input: ArchitectInput): Promise<ArchitectDNA> {
  const cacheKey = getCacheKey(input);
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[Architect] Cache HIT for key ${cacheKey}`);
    return cached;
  }

  console.log(`[Architect] Cache MISS — running extraction for "${input.title}"`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const prompt = buildArchitectPrompt(input);
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  let dna: ArchitectDNA;
  try {
    dna = JSON.parse(text) as ArchitectDNA;
  } catch (parseErr) {
    // Attempt to extract JSON from markdown fences if the model wrapped it
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      dna = JSON.parse(jsonMatch[1].trim()) as ArchitectDNA;
    } else {
      console.error("[Architect] Failed to parse DNA JSON:", text.slice(0, 500));
      throw new Error("Architect returned invalid JSON. Please try again.");
    }
  }

  // Validate required fields
  if (!dna.painPoint || !dna.hookDraft || !dna.timingMap) {
    console.error("[Architect] DNA missing required fields:", JSON.stringify(dna).slice(0, 500));
    throw new Error("Architect returned incomplete DNA. Please try again.");
  }

  // Normalize hookStyle to valid enum
  const validStyles: ArchitectDNA["hookStyle"][] = ["result-led", "experience-led", "problem-led"];
  if (!validStyles.includes(dna.hookStyle)) {
    dna.hookStyle = "result-led"; // safe default
  }

  setCache(cacheKey, dna);
  return dna;
}

// ─── DNA Context Formatting ──────────────────────────────────────────────────

/**
 * Formats the Architect's output into a string for {{DNA_CONTEXT}} variable replacement.
 * This is injected into the "Strategic DNA" section of the prompt preset.
 */
export function formatDNAContext(dna: ArchitectDNA): string {
  const stepLines = dna.timingMap.steps
    .map(
      (s) =>
        `- ${s.name}: ${s.allocatedSeconds}s (${s.complexity}) — Transition: ${s.transitionHint}`
    )
    .join("\n");

  return `You have been given the following strategic analysis of this video. Use it to inform your writing decisions — especially the hook, bridge, pacing, and authority threading.

Pain Point (what the viewer is struggling with): ${dna.painPoint}

Authority Anchor (why they should listen — weave this into the body of the script, not just the intro): ${dna.authorityAnchor}

Core Transformation (what changes by the end): ${dna.coreTransformation}

Hook Style (Proof Type): ${dna.hookStyle}
Suggested Hook (Proof + Promise) — Deliver with HIGH ENERGY:
"${dna.hookDraft}"

Bridge (The Plan/Roadmap) — Deliver with a calm, authoritative tone:
"${dna.bridgeDraft}"

IMPORTANT INSTRUCTION FOR PERFORMER: Rely heavily on natural punctuation (like em-dashes "—", ellipses "...", and hard paragraph breaks) to create natural pacing and pauses, especially between the Bridge and the first step. Do NOT use explicit break tokens like (break) or <break> as they cause audio glitches. Also, pay close attention to the Transition Hints between steps!

Timing Allocation:
- Hook: ${dna.timingMap.hookSeconds}s
- Bridge: ${dna.timingMap.bridgeSeconds}s
${stepLines}
- Closing: ${dna.timingMap.closingSeconds}s`;
}
