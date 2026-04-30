import { NextRequest, NextResponse } from "next/server";
import { getPromptsDB, savePromptsDB, resetToDefaults, getPromptsHistory, PromptPreset, PromptsDB, PronunciationEntry } from "@/lib/prompts-db";

// Checks if required variables are missing across all sections/content
function getMissingVars(preset: PromptPreset): string[] {
  const contentToSearch = preset.sections 
    ? preset.sections.map(s => s.content).join("\n\n") 
    : (preset.content || "");

  const missing: string[] = [];

  if (preset.type === "solo") {
    if (!contentToSearch.includes("{{TITLE}}")) missing.push("{{TITLE}}");
    if (!contentToSearch.includes("{{INSTRUCTIONS}}")) missing.push("{{INSTRUCTIONS}}");
    if (!contentToSearch.includes("{{TARGET_WORD_COUNT}}")) missing.push("{{TARGET_WORD_COUNT}}");
  } else if (preset.type === "masterclass") {
    if (!contentToSearch.includes("{{TITLE}}")) missing.push("{{TITLE}}");
    if (!contentToSearch.includes("{{SOFTWARE_NAME}}")) missing.push("{{SOFTWARE_NAME}}");
    if (!contentToSearch.includes("{{TARGET_WORD_COUNT}}")) missing.push("{{TARGET_WORD_COUNT}}");
    if (!contentToSearch.includes("{{DATA_BLOCK}}")) missing.push("{{DATA_BLOCK}}");
  }

  return missing;
}

export async function GET() {
  try {
    const db = await getPromptsDB();
    // Return both formats for backwards compatibility while frontend updates
    return NextResponse.json({ db, presets: db.presets });
  } catch (err) {
    return NextResponse.json({ error: "Failed to read prompts DB" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const db = await getPromptsDB();
    
    // Action-based routing
    const action = payload.action || "savePreset";

    if (action === "savePreset") {
      const preset: PromptPreset = payload.preset || payload; // fallback for legacy frontend

      if (!preset.name) {
        return NextResponse.json({ error: "Preset name is required." }, { status: 400 });
      }

      const missingVars = getMissingVars(preset);
      preset.isDraft = missingVars.length > 0;

      const existingIndex = db.presets.findIndex(p => p.id === preset.id);
      
      if (existingIndex >= 0) {
        db.presets[existingIndex] = {
          ...db.presets[existingIndex],
          ...preset,
          isDefault: false
        };
      } else {
        preset.id = `preset_${Date.now()}`;
        preset.isDefault = false;
        db.presets.push(preset);
      }

      await savePromptsDB(db);
      return NextResponse.json({ db, presets: db.presets, savedId: preset.id, missingVars });

    } else if (action === "saveGlobalRules") {
      db.globalRules = payload.globalRules ?? "";
      await savePromptsDB(db);
      return NextResponse.json({ db });

    } else if (action === "savePronunciations") {
      db.pronunciationTable = payload.pronunciationTable || [];
      await savePromptsDB(db);
      return NextResponse.json({ db });

    } else if (action === "getHistory") {
      const history = await getPromptsHistory();
      return NextResponse.json({ history });

    } else if (action === "restoreVersion") {
      const history = await getPromptsHistory();
      const version = history[payload.index];
      if (!version) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
      await savePromptsDB(version.db);
      return NextResponse.json({ db: version.db });

    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

  } catch (err) {
    return NextResponse.json({ error: "Failed to save to prompts DB" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const resetDB = await resetToDefaults();
    return NextResponse.json({ db: resetDB, presets: resetDB.presets });
  } catch (err) {
    return NextResponse.json({ error: "Failed to reset presets" }, { status: 500 });
  }
}
