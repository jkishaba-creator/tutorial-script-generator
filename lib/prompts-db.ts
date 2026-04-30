import fs from "fs";
import path from "path";

export interface PromptSection {
  key: string;              // "persona" | "tone" | "timing" | "content" | "rules" | "vocal" | "reference" | "data"
  label: string;            // Display name
  content: string;          // The actual prompt text
  isReference?: boolean;    // Wraps content in """ quotes during concatenation
  requiredVars?: string[];  // Variables this section is expected to contain
  productionRole?: string;  // "The Actor" | "The Director" | etc. — tooltip in UI
}

export interface PromptPreset {
  id: string;
  name: string;
  type: "solo" | "masterclass";
  isDefault?: boolean;
  isDraft?: boolean;

  // Legacy format (backwards compatible)
  content?: string;

  // Sectioned format
  sections?: PromptSection[];

  // Performance settings
  wpm?: number;              // Words per minute, default 150
}

export interface PronunciationEntry {
  original: string;
  phonetic: string;
  caseSensitive: boolean;
}

export interface PromptsDB {
  presets: PromptPreset[];
  globalRules: string;
  pronunciationTable: PronunciationEntry[];
  pauseTokens: Record<string, Record<string, string>>;
  version: number;              // Schema version for migrations
}

const DEFAULT_SOLO_SECTIONS: PromptSection[] = [
  {
    key: "persona",
    label: "Persona",
    productionRole: "The Actor",
    requiredVars: [],
    content: "You are an experienced, approachable tech educator creating a voiceover script for a YouTube tutorial. You speak like a knowledgeable friend — clear, patient, and genuinely helpful. You never use academic language or talk down to the viewer. Your explanations feel natural, like you're walking someone through the process in real time."
  },
  {
    key: "strategy",
    label: "Strategic DNA",
    productionRole: "The Strategist",
    requiredVars: ["{{DNA_CONTEXT}}"],
    content: "{{DNA_CONTEXT}}"
  },
  {
    key: "tone",
    label: "Tone & Energy",
    productionRole: "The Director",
    requiredVars: [],
    content: "Maintain a conversational, upbeat energy throughout. The script should feel like a knowledgeable friend explaining something they're excited about — not a textbook or a sales pitch. Vary sentence length to create natural rhythm: short punchy sentences for emphasis, longer ones for explanation. Avoid monotone phrasing — the text should have a natural rise and fall when read aloud."
  },
  {
    key: "content",
    label: "Content Direction",
    productionRole: "The Writer",
    requiredVars: [],
    content: "Transform the step-by-step instructions into fluid, natural narration. For each step:\\n- Explain the *why* before the *how* — give the viewer context for what they're about to do.\\n- Add practical tips or common pitfalls where they naturally fit, but do not invent new steps.\\n- Use specific, concrete language (\\\"click the blue 'Export' button in the top-right corner\\\") rather than vague directions (\\\"go to the export option\\\").\\n- When a step involves waiting or loading, acknowledge it naturally (\\\"This might take a moment to process...\\\")."
  },
  {
    key: "rules",
    label: "Hard Rules",
    productionRole: "The Censor",
    requiredVars: ["{{TARGET_WORD_COUNT}}"],
    content: "STRICT REQUIREMENTS — the following must be obeyed without exception:\\n- Output ONLY the spoken script. No titles, headers, step numbers, bullet points, or bold text.\\n- Do NOT use asterisks (*) for emphasis or any other purpose. The output is fed directly to a TTS engine.\\n- Remove all sensitive information: names, emails, passwords, API keys, phone numbers.\\n- Do not add rhetorical questions that derail the video's purpose.\\n- Do not add unsolicited commentary, opinions, or tangential advice not present in the original instructions.\\n- Do not significantly exceed the target word count of {{TARGET_WORD_COUNT}} words."
  },
  {
    key: "vocal",
    label: "Vocal Performance",
    productionRole: "The Voice Coach",
    requiredVars: [],
    content: "Write this script to sound natural and human when read aloud by an AI voice. Follow these vocal performance guidelines:\\n\\n- Use natural filler phrases sparingly but deliberately: \\\"Now,\\\" \\\"So,\\\" \\\"Alright,\\\" \\\"And here's the thing,\\\" — these give the AI voice rhythmic anchor points that prevent robotic pacing.\\n- Vary sentence structure: mix short declarative sentences with longer, flowing explanations. Monotone sentence length creates monotone audio.\\n- Write transitions as spoken bridges, not written ones. Say \\\"So now that we've got that set up, let's move on to...\\\" instead of \\\"Next step:\\\".\\n- When introducing something important, use a brief setup phrase: \\\"And here's the really important part...\\\" or \\\"Now, pay attention to this one...\\\" — these trigger natural emphasis in the voice.\\n- Avoid parenthetical asides in brackets or parentheses. If the information is worth saying, weave it into the narration naturally.\\n- Do not use em-dashes for dramatic pauses. Instead, end the sentence and start a new one. Short sentences create natural pauses in TTS.\\n- Weave the creator's authority and credibility naturally throughout the body, not just the introduction. Reference the Authority Anchor from the Strategic DNA section at least once more during the tutorial body to maintain trust."
  },
  {
    key: "reference",
    label: "Reference Examples",
    productionRole: "The Mood Board",
    isReference: true,
    requiredVars: [],
    content: "" // Empty by default
  },
  {
    key: "data",
    label: "Data Injection",
    productionRole: "The Teleprompter",
    requiredVars: ["{{TITLE}}", "{{TARGET_WORD_COUNT}}", "{{INSTRUCTIONS}}"],
    content: "The video title, target length, and step-by-step instructions are below:\\n\\nVideo Title: {{TITLE}}\\nTarget Length: {{TARGET_WORD_COUNT}} words\\n\\nStep-by-step instructions:\\n{{INSTRUCTIONS}}"
  }
];

const DEFAULT_MASTERCLASS_SECTIONS: PromptSection[] = [
  {
    key: "persona",
    label: "Persona",
    productionRole: "The Actor",
    requiredVars: [],
    content: "You are a confident software expert hosting a masterclass-style YouTube tutorial. You're energetic but focused, guiding viewers through multiple use cases with the authority of someone who uses this tool daily. Your tone balances professionalism with conversational warmth."
  },
  {
    key: "strategy",
    label: "Strategic DNA",
    productionRole: "The Strategist",
    requiredVars: ["{{DNA_CONTEXT}}"],
    content: "{{DNA_CONTEXT}}"
  },
  {
    key: "tone",
    label: "Tone & Energy",
    productionRole: "The Director",
    requiredVars: [],
    content: "Maintain a conversational, upbeat energy throughout. The script should feel like a knowledgeable expert explaining something they're excited about — not a textbook or a sales pitch. Vary sentence length to create natural rhythm: short punchy sentences for emphasis, longer ones for explanation. Avoid monotone phrasing — the text should have a natural rise and fall when read aloud."
  },
  {
    key: "content",
    label: "Content Direction",
    productionRole: "The Writer",
    requiredVars: [],
    content: "Transform the multi-use-case instructions into fluid, natural narration. For each use case:\\n- Explain the *why* before the *how* — give the viewer context for what they're about to do.\\n- Add practical tips or common pitfalls where they naturally fit, but do not invent new steps.\\n- Use specific, concrete language.\\n- When a step involves waiting or loading, acknowledge it naturally."
  },
  {
    key: "rules",
    label: "Hard Rules",
    productionRole: "The Censor",
    requiredVars: ["{{TARGET_WORD_COUNT}}"],
    content: "STRICT REQUIREMENTS — the following must be obeyed without exception:\\n- Output ONLY the spoken script. No titles, headers, step numbers, bullet points, or bold text.\\n- Do NOT use asterisks (*) for emphasis or any other purpose. The output is fed directly to a TTS engine.\\n- Remove all sensitive information: names, emails, passwords, API keys, phone numbers.\\n- Do not add rhetorical questions that derail the video's purpose.\\n- Do not add unsolicited commentary or opinions not present in the original instructions.\\n- Do not significantly exceed the target word count of {{TARGET_WORD_COUNT}} words."
  },
  {
    key: "vocal",
    label: "Vocal Performance",
    productionRole: "The Voice Coach",
    requiredVars: [],
    content: "Write this script to sound natural and human when read aloud by an AI voice. Follow these vocal performance guidelines:\\n\\n- Use natural filler phrases sparingly but deliberately: \\\"Now,\\\" \\\"So,\\\" \\\"Alright,\\\" \\\"And here's the thing,\\\" — these give the AI voice rhythmic anchor points that prevent robotic pacing.\\n- Vary sentence structure: mix short declarative sentences with longer, flowing explanations.\\n- Write transitions as spoken bridges, not written ones. Say \\\"So now that we've got that set up, let's move on to...\\\" instead of \\\"Next use case:\\\".\\n- Avoid parenthetical asides in brackets or parentheses. If the information is worth saying, weave it into the narration naturally.\\n- Do not use em-dashes for dramatic pauses. Instead, end the sentence and start a new one. Short sentences create natural pauses in TTS.\\n- Weave the creator's authority and credibility naturally throughout the body, not just the introduction. Reference the Authority Anchor from the Strategic DNA section at least once more during the tutorial body to maintain trust."
  },
  {
    key: "reference",
    label: "Reference Examples",
    productionRole: "The Mood Board",
    isReference: true,
    requiredVars: [],
    content: "" // Empty by default
  },
  {
    key: "data",
    label: "Data Injection",
    productionRole: "The Teleprompter",
    requiredVars: ["{{SOFTWARE_NAME}}", "{{TITLE}}", "{{DATA_BLOCK}}"],
    content: "Here is the data for this video:\\n\\nSoftware Name: {{SOFTWARE_NAME}}\\nVideo Title: {{TITLE}}\\nTarget Length: {{TARGET_WORD_COUNT}} words\\n\\n{{DATA_BLOCK}}"
  }
];

export const DEFAULT_DB: PromptsDB = {
  presets: [
    { 
      id: "default-solo", 
      name: "Factory Default Solo", 
      type: "solo", 
      isDefault: true,
      wpm: 150,
      sections: DEFAULT_SOLO_SECTIONS 
    },
    { 
      id: "default-masterclass", 
      name: "Factory Default Masterclass", 
      type: "masterclass", 
      isDefault: true,
      wpm: 150,
      sections: DEFAULT_MASTERCLASS_SECTIONS 
    },
  ],
  globalRules: "",
  pronunciationTable: [],
  pauseTokens: {
    "PAUSE": {
      "fish": "(break)",
      "elevenlabs": '<break time="0.75s"/>',
      "gemini": ""
    },
    "PAUSE_LONG": {
      "fish": "(long-break)",
      "elevenlabs": '<break time="1.5s"/>',
      "gemini": ""
    }
  },
  version: 3
};

import { Redis } from "@upstash/redis";

const DB_PATH = path.join(process.cwd(), "data", "prompts.json");

// Helper to get Redis client if available
function getRedisClient() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return null;
}

export async function getPromptsDB(): Promise<PromptsDB> {
  try {
    const redis = getRedisClient();
    let raw: string | null = null;
    let parsed: any = null;

    if (redis) {
      // Load from KV
      const data = await redis.get("prompts:current");
      if (data) {
        parsed = typeof data === "string" ? JSON.parse(data) : data;
      }
    } else {
      // Load from FS
      if (fs.existsSync(DB_PATH)) {
        raw = fs.readFileSync(DB_PATH, "utf-8");
        parsed = JSON.parse(raw);
      }
    }

    if (!parsed) {
      await savePromptsDB(DEFAULT_DB);
      return DEFAULT_DB;
    }

    // Migration logic: if the parsed file is an array, it's the old schema
    if (Array.isArray(parsed)) {
      const migratedDB: PromptsDB = {
        ...DEFAULT_DB,
        presets: parsed.map((p: any) => ({
          ...p,
          wpm: 150, // default
          // if it's default, we overwrite with sections to forcefully upgrade them.
          // if it's not default, we preserve their legacy content string.
          sections: p.isDefault ? (p.type === "solo" ? DEFAULT_SOLO_SECTIONS : DEFAULT_MASTERCLASS_SECTIONS) : undefined,
          content: p.isDefault ? undefined : p.content
        }))
      };
      // We also ensure default presets exist if they were deleted
      if (!migratedDB.presets.find(p => p.id === "default-solo")) {
        migratedDB.presets.push(DEFAULT_DB.presets[0]);
      }
      if (!migratedDB.presets.find(p => p.id === "default-masterclass")) {
        migratedDB.presets.push(DEFAULT_DB.presets[1]);
      }
      
      await savePromptsDB(migratedDB);
      return migratedDB;
    }

    // V2 → V3 migration: replace factory default sections, add pauseTokens
    if (!Array.isArray(parsed) && (!parsed.version || parsed.version < 3)) {
      const db = parsed as PromptsDB;
      db.presets = db.presets.map((p: any) => {
        // Only overwrite factory defaults — custom presets are preserved
        if (p.id === "default-solo" && p.isDefault) {
          return { ...p, sections: DEFAULT_SOLO_SECTIONS };
        }
        if (p.id === "default-masterclass" && p.isDefault) {
          return { ...p, sections: DEFAULT_MASTERCLASS_SECTIONS };
        }
        return p;
      });
      if (!db.pauseTokens) {
        db.pauseTokens = DEFAULT_DB.pauseTokens;
      }
      db.version = 3;
      await savePromptsDB(db);
      return db;
    }

    return parsed as PromptsDB;
  } catch (err) {
    console.error("Error reading prompts DB:", err);
    return DEFAULT_DB;
  }
}

export interface PromptVersion {
  timestamp: string;
  db: PromptsDB;
}

export async function savePromptsDB(db: PromptsDB): Promise<void> {
  const redis = getRedisClient();

  if (redis) {
    // KV Storage: manage history array
    const current = await redis.get("prompts:current");
    if (current) {
      let history: PromptVersion[] = (await redis.get("prompts:history")) || [];
      // Push current to history
      history.unshift({
        timestamp: new Date().toISOString(),
        db: typeof current === "string" ? JSON.parse(current) : current
      });
      // Keep last 10 versions
      history = history.slice(0, 10);
      await redis.set("prompts:history", history);
    }
    await redis.set("prompts:current", db);
  } else {
    // Local FS Storage: manage .bak files
    const tmpPath = `${DB_PATH}.tmp`;
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf-8");

      // Manage 10 rolling backups before overwriting the main file
      if (fs.existsSync(DB_PATH)) {
        for (let i = 9; i >= 1; i--) {
          const oldBackup = `${DB_PATH}.bak${i}`;
          const newBackup = `${DB_PATH}.bak${i + 1}`;
          if (fs.existsSync(oldBackup)) {
            fs.renameSync(oldBackup, newBackup);
          }
        }
        fs.copyFileSync(DB_PATH, `${DB_PATH}.bak1`);
      }

      fs.renameSync(tmpPath, DB_PATH);
    } catch (err) {
      console.error("Failed atomic write for prompts.json:", err);
      throw err;
    }
  }
}

export async function getPromptsHistory(): Promise<PromptVersion[]> {
  const redis = getRedisClient();
  if (redis) {
    const history = await redis.get("prompts:history");
    return (history as PromptVersion[]) || [];
  }
  
  // Local fallback: read .bak files
  const history: PromptVersion[] = [];
  for (let i = 1; i <= 10; i++) {
    const bakPath = `${DB_PATH}.bak${i}`;
    if (fs.existsSync(bakPath)) {
      try {
        const stats = fs.statSync(bakPath);
        const raw = fs.readFileSync(bakPath, "utf-8");
        history.push({
          timestamp: stats.mtime.toISOString(),
          db: JSON.parse(raw)
        });
      } catch (err) {
        console.error(`Error reading backup ${i}:`, err);
      }
    }
  }
  return history;
}

export async function resetToDefaults(): Promise<PromptsDB> {
  await savePromptsDB(DEFAULT_DB);
  return DEFAULT_DB;
}

export function buildFinalPrompt(preset: PromptPreset, globalRules: string): string {
  // Legacy single-string preset
  if (preset.content && (!preset.sections || preset.sections.length === 0)) {
    return globalRules.trim()
      ? `${preset.content.trim()}\n\n${globalRules.trim()}`
      : preset.content.trim();
  }

  // Sectioned preset
  const parts: string[] = [];
  
  for (const section of (preset.sections || [])) {
    if (!section.content.trim()) continue; // skip empty sections
    
    if (section.isReference) {
      parts.push(
        `Study the following example of the desired output style. Match this voice, rhythm, and energy level:\n\n"""\n${section.content.trim()}\n"""`
      );
    } else if (section.key === "rules" && globalRules.trim()) {
      // Merge preset rules + global rules
      parts.push(`${section.content.trim()}\n\n${globalRules.trim()}`);
    } else {
      parts.push(section.content.trim());
    }
  }
  
  return parts.join("\n\n");
}

export function computeTimingVars(targetWordCount: number, wpm: number, items: number) {
  const effectiveWpm = wpm > 0 ? wpm : 150;
  return {
    TARGET_MINUTES: (targetWordCount / effectiveWpm).toFixed(1),
    WPM: effectiveWpm.toString(),
    SECONDS_PER_ITEM: Math.round((targetWordCount / items / effectiveWpm) * 60).toString(),
  };
}
