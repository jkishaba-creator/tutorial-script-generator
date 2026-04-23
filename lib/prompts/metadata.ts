/**
 * Metadata Generation Prompt — YouTube SEO Package
 *
 * This prompt instructs Gemini to watch the video and generate a complete
 * metadata package: reformatted title, thumbnail text, SEO tags, and
 * an NLP-optimized description. The rules are taken verbatim from the
 * user's production Gemini Gem.
 *
 * Returns structured JSON for reliable parsing.
 */
export function buildMetadataPrompt(originalTitle: string): string {
  return `You are a professional YouTube SEO metadata generator. You have just watched this video. The original filename/title is: "${originalTitle}".

Based on the ACTUAL CONTENT of the video you just watched, generate all four metadata fields below. Return your response as a valid JSON object with exactly these four keys: "title", "thumbnailText", "tags", "description".

--- FIELD 1: "title" ---
Reformat the original title following these EXACT rules:
1. Capitalize the start of ALL words that are over 2 characters long. Words of 2 characters or fewer (e.g., "to", "a", "in", "is", "on") stay lowercase UNLESS they are the first word.
2. If the original title has parentheses, REMOVE the parentheses characters but KEEP the text that was inside them.
3. Never remove or change any words from the original title.
4. At the END of every title, append exactly one phrase in parentheses. You MUST rotate between all four options evenly. Pick the one that best matches the video content:
   - (Full Guide 2026) — for comprehensive walkthroughs
   - (Updated 2026) — for refreshed or current-year content
   - (Easy Guide) — for beginner-friendly or simplified tutorials
   - (Tested) — for reviews, comparisons, or hands-on demonstrations
   Do NOT default to the same suffix repeatedly. Use ALL four across a batch.

Example: "how to use claude AI as a finance pro to save hours of work" → "How to Use Claude AI as a Finance Pro to Save Hours of Work (Updated 2026)"

--- FIELD 2: "thumbnailText" ---
Create a 3–4 word question that represents the MAIN PROBLEM or question the viewer is trying to solve (which the video answers).
Rules:
1. Do NOT summarize the title. Instead, think about what problem drove the viewer to search for this video.
2. IGNORE any words that were in parentheses in the original title.
3. Capitalize the first letter of every word.
4. Output ONLY the question phrase, nothing else.

Example: If the title is "How To Start From A Blank Template on Squarespace," the thumbnail text should be "Starting A New Website?"

--- FIELD 3: "tags" ---
Generate a high-volume, comma-separated list of YouTube SEO tags.
Rules:
1. HARD LIMIT: The ENTIRE tags string must be 400 characters or fewer. Count every character including commas and spaces. If your output exceeds 400 characters, remove tags from the end until it fits. This is a strict ceiling, not a suggestion.
2. EXPAND & VARY: Do NOT just use words from the title. You MUST include synonyms, related search terms, alternate phrasings, and broad category tags (e.g., if the title is about "Claude," also tag "AI tools," "Chatbot," "Anthropic," "LLM").
3. Use a MIX of short single-word tags AND longer "long-tail" search phrases (e.g., "how to use Claude AI for beginners").
4. Format: comma-separated, no line breaks, no numbering, no quotes around individual tags.
5. Before finalizing, COUNT the characters. If over 400, trim tags from the end.

--- FIELD 4: "description" ---
Write an NLP-optimized YouTube description. Format EXACTLY two sections separated by a blank line:

Section 1: A natural, conversational paragraph (2-3 sentences) starting with "In this video, we discuss..." Weave the generated tags INTO these sentences grammatically to describe the value of the video. Do NOT just list the tags; use them as natural context within flowing sentences.

Section 2: Convert the top 3 most relevant tags into hashtags and list them on the final line (e.g., #ClaudeAI #AITools #Productivity).

IMPORTANT: Do NOT include the title or the tags string in the description. Those are written to separate fields. The description should ONLY contain the summary paragraph and the hashtags line.

--- OUTPUT FORMAT ---
Return ONLY a valid JSON object. No markdown, no code fences, no extra text:
{"title": "...", "thumbnailText": "...", "tags": "...", "description": "..."}`;
}

/**
 * Parse the metadata JSON from Gemini's response.
 * Handles common issues like markdown code fences or extra whitespace.
 */
export interface VideoMetadata {
  title: string;
  thumbnailText: string;
  tags: string;
  description: string;
}

export function parseMetadataResponse(raw: string): VideoMetadata {
  // Strip markdown code fences if present
  let cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Try to extract JSON object from the response
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini did not return valid JSON for metadata generation.");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate required fields
  if (!parsed.title || !parsed.thumbnailText || !parsed.tags || !parsed.description) {
    throw new Error("Metadata response is missing required fields (title, thumbnailText, tags, description).");
  }

  // Enforce 400-character tag limit — trim from the end at the last clean comma
  let tags = String(parsed.tags).trim();
  if (tags.length > 400) {
    tags = tags.substring(0, 400);
    const lastComma = tags.lastIndexOf(",");
    if (lastComma > 0) {
      tags = tags.substring(0, lastComma).trim();
    }
  }

  return {
    title: String(parsed.title).trim(),
    thumbnailText: String(parsed.thumbnailText).trim(),
    tags,
    description: String(parsed.description).trim(),
  };
}
