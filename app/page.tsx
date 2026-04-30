"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Play, Download, FileText, Mic, Plus, Trash2, Layers, Settings, LayoutList, Target, Check, Lock, X, Video, Copy, AlertTriangle, Square, Sheet, ChevronDown, ChevronUp, Link, History, RefreshCw } from "lucide-react";

type Mode = "single" | "masterclass" | "chapters" | "factory";
type ChapterBatchMode = "single" | "batch" | "multi-id";
type UseCaseEntry = { taskName: string; instructions: string };

interface BatchFile {
  id: string;
  name: string;
  status: "pending" | "processing" | "success" | "error";
  chapters?: string;
  title?: string;
  thumbnailText?: string;
  tags?: string;
  description?: string;
  error?: string;
  errorCategory?: string;
  sheetsStatus?: "pending" | "writing" | "written" | "error";
  sheetsError?: string;
}

interface PromptSection {
  key: string;              // "persona" | "tone" | "timing" | "content" | "rules" | "vocal" | "reference" | "data"
  label: string;
  content: string;
  isReference?: boolean;
  requiredVars?: string[];
  productionRole?: string;
}

interface PromptPreset {
  id: string;
  name: string;
  type: "solo" | "masterclass";
  isDefault?: boolean;
  isDraft?: boolean;
  content?: string; // Legacy
  sections?: PromptSection[];
  wpm?: number;
}

interface PronunciationEntry {
  original: string;
  phonetic: string;
  caseSensitive: boolean;
}

interface StepTiming {
  name: string;
  allocatedSeconds: number;
  complexity: "simple" | "moderate" | "complex";
  transitionHint: string;
}

interface ArchitectDNA {
  painPoint: string;
  authorityAnchor: string;
  coreTransformation: string;
  hookStyle: "curiosity" | "bold_statement" | "teaser";
  hookDraft: string;
  bridgeDraft: string;
  timingMap: {
    hookSeconds: number;
    bridgeSeconds: number;
    steps: StepTiming[];
    closingSeconds: number;
  };
}

interface PromptsDB {
  presets: PromptPreset[];
  globalRules: string;
  pronunciationTable: PronunciationEntry[];
  pauseTokens?: Record<string, Record<string, string>>;
  version: number;
}

function PresetEditor({
  preset,
  globalRules,
  onChange,
  onSave,
  onSaveGlobalRules,
  isSaving,
  error
}: {
  preset: PromptPreset;
  globalRules: string;
  onChange: (p: PromptPreset) => void;
  onSave: (asNew: boolean) => void;
  onSaveGlobalRules: (val: string) => void;
  isSaving: boolean;
  error: string | null;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [globalExpanded, setGlobalExpanded] = useState(false);
  
  const handleSectionChange = (index: number, content: string) => {
    if (!preset.sections) return;
    const newSections = [...preset.sections];
    newSections[index] = { ...newSections[index], content };
    onChange({ ...preset, sections: newSections });
  };

  const toggleSection = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const activeGlobalRulesCount = globalRules.split('\n').filter(l => l.trim()).length;

  // Insert Global Rules dynamically before Reference Examples
  // To keep rendering simple, we render the preset sections, but we splice Global Rules right before Data Injection visually.
  // Actually, rendering sequentially is fine. Let's find the index of "reference" or "data"
  
  return (
    <div className="space-y-3 p-3 bg-[#111111] border border-[#262626] rounded-[6px] animate-in slide-in-from-top-2 duration-200">
      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
      
      <div className="flex gap-2 items-center mb-2">
        <input 
          type="text" 
          value={preset.name} 
          onChange={e => onChange({...preset, name: e.target.value})} 
          className="ink-input w-full px-3 py-2 text-sm disabled:opacity-50 font-semibold" 
          placeholder="Preset Name" 
        />
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase text-[#8a8a8b] whitespace-nowrap">WPM</label>
          <input 
            type="number" 
            value={preset.wpm || 150} 
            onChange={e => onChange({...preset, wpm: parseInt(e.target.value) || 150})} 
            className="ink-input w-20 px-2 py-2 text-sm text-center disabled:opacity-50" 
          />
        </div>
      </div>

      {preset.sections ? (
        <div className="space-y-2">
          {preset.sections.map((section, idx) => {
            const isExpanded = expanded[section.key];
            const hasRequiredVars = section.requiredVars && section.requiredVars.length > 0;
            const isGlobalInsertPoint = section.key === "reference" || section.key === "data";
            const prevSection = idx > 0 ? preset.sections![idx - 1] : null;
            
            // We want Global Rules to render immediately after Vocal Performance (or Rules)
            const shouldRenderGlobalHere = section.key === "reference" || (section.key === "data" && !preset.sections!.find(s => s.key === "reference"));

            return (
              <div key={section.key}>
                {shouldRenderGlobalHere && (
                  <div className="border border-[#262626] rounded-[4px] bg-[#161618] overflow-hidden mb-2 shadow-lg">
                    <div 
                      className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1c] transition-colors"
                      onClick={() => setGlobalExpanded(!globalExpanded)}
                    >
                      <div className="flex items-center gap-2">
                        <Link className="w-3.5 h-3.5 text-[#8a8a8b]" />
                        <span className="text-xs font-semibold text-[#e2e2e2] uppercase tracking-wider">Global Rules</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#262626] text-[#e2e2e2]">
                          {activeGlobalRulesCount} Active Constraint{activeGlobalRulesCount !== 1 ? "s" : ""}
                        </span>
                        {globalExpanded ? <ChevronUp className="w-4 h-4 text-[#8a8a8b]" /> : <ChevronDown className="w-4 h-4 text-[#8a8a8b]" />}
                      </div>
                    </div>
                    {globalExpanded && (
                      <div className="p-3 border-t border-[#262626] bg-[#0c0c0d]">
                        <textarea 
                          value={globalRules}
                          onChange={(e) => onSaveGlobalRules(e.target.value)}
                          placeholder="Enter global rules that apply to ALL presets..."
                          className="w-full bg-transparent text-sm font-mono text-[#e2e2e2] outline-none resize-y min-h-[80px]"
                        />
                      </div>
                    )}
                  </div>
                )}
                
                <div className="border border-[#262626] rounded-[4px] bg-[#161618] overflow-hidden">
                  <div 
                    className={`px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-[#1a1a1c] transition-colors ${section.isReference ? "border-l-2 border-violet-500" : ""} ${section.key === "data" ? "border-l-2 border-amber-500" : ""}`}
                    onClick={() => toggleSection(section.key)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#e2e2e2] uppercase tracking-wider">{section.label}</span>
                      {section.productionRole && <span className="text-[10px] text-[#8a8a8b]">({section.productionRole})</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      {hasRequiredVars && (
                        <div className="flex gap-1">
                          {section.requiredVars!.map(v => {
                            const isPresent = section.content.includes(v);
                            return (
                              <span key={v} className={`text-[10px] px-1.5 py-0.5 rounded ${isPresent ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`} title={v}>
                                {isPresent ? "✅" : "⚠️"} {v.replace(/[{}]/g, "")}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[#8a8a8b]" /> : <ChevronDown className="w-4 h-4 text-[#8a8a8b]" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="p-3 border-t border-[#262626] bg-[#0c0c0d]">
                      {section.key === "data" && (
                        <div className="mb-2 text-[10px] text-amber-400 bg-amber-400/10 p-1.5 rounded">
                          ⚠️ This section feeds your video data to the AI. Removing variables here means the AI won&apos;t see that data.
                        </div>
                      )}
                      <textarea 
                        value={section.content}
                        onChange={(e) => handleSectionChange(idx, e.target.value)}
                        placeholder={section.isReference ? "Paste 2-3 paragraphs from a script you loved. The AI will match its tone and rhythm." : ""}
                        className="w-full bg-transparent text-sm font-mono text-[#e2e2e2] outline-none resize-y min-h-[80px]"
                      />
                    </div>
                  )}
                  {!isExpanded && section.content.trim() && (
                    <div className="px-3 pb-2 text-xs text-[#8a8a8b] truncate">
                      {section.content.replace(/\n/g, " ")}
                    </div>
                  )}
                  {!isExpanded && !section.content.trim() && section.isReference && (
                    <div className="px-3 pb-2 text-xs text-[#8a8a8b] italic">
                      (empty — paste a script excerpt to set the tone)
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <textarea 
          value={preset.content} 
          onChange={e => onChange({...preset, content: e.target.value})} 
          className="ink-input w-full px-3 py-2 font-mono text-xs resize-y h-48" 
        />
      )}

      <div className="flex justify-between items-center pt-2">
        <div>
          {preset.isDraft && (
            <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1.5 bg-amber-400/10 px-2 py-1 rounded">
              <AlertTriangle className="w-3.5 h-3.5" />
              Missing required variables
            </span>
          )}
        </div>
        <div className="flex justify-end gap-2">
          {!preset.isDefault && (
            <button type="button" onClick={() => onSave(false)} disabled={isSaving} className="px-3 py-1.5 text-[11px] font-medium text-[#e2e2e2] bg-[#1e1e20] hover:bg-[#262626] rounded-[4px] transition-colors">
              Overwrite
            </button>
          )}
          <button type="button" onClick={() => onSave(true)} disabled={isSaving} className="px-3 py-1.5 text-[11px] font-medium text-black bg-[#e2e2e2] hover:bg-white rounded-[4px] transition-colors">
            Save as New
          </button>
        </div>
      </div>
    </div>
  );
}

const INITIAL_USE_CASES: UseCaseEntry[] = [
  { taskName: "", instructions: "" },
  { taskName: "", instructions: "" },
];

const PIN_CODE = "852963";

export default function Home() {
  const [pinInput, setPinInput] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [mode, setMode] = useState<Mode>("single");
  const [title, setTitle] = useState("");
  const [targetWordCount, setTargetWordCount] = useState(1600);
  const [instructions, setInstructions] = useState("");
  const [script, setScript] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFormat, setAudioFormat] = useState<"mp3" | "wav">("mp3");
  const [voiceProvider, setVoiceProvider] = useState<"elevenlabs" | "fish" | "gemini">("fish");
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chapters mode state
  const [chapterMode, setChapterMode] = useState<ChapterBatchMode>("single");
  const [driveFileId, setDriveFileId] = useState("");
  const [driveFolderId, setDriveFolderId] = useState("");
  const [driveFolderName, setDriveFolderName] = useState("");
  const [chapterVideoTitle, setChapterVideoTitle] = useState("");
  const [chapters, setChapters] = useState("");
  const [chapterFileName, setChapterFileName] = useState("");
  const [isGeneratingChapters, setIsGeneratingChapters] = useState(false);
  const [chaptersCopied, setChaptersCopied] = useState(false);

  // Dashboard queue state
  const [manualFolders, setManualFolders] = useState<any[]>([]);
  const [expandedManualFolderId, setExpandedManualFolderId] = useState<string | null>(null);
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);

  // Multi-ID batch state
  const [multiIdInput, setMultiIdInput] = useState("");
  const [batchFiles, setBatchFiles] = useState<BatchFile[]>([]);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [batchComplete, setBatchComplete] = useState(false);
  const batchAbortRef = useRef(false);

  // Sheets state
  const [spreadsheetId, setSpreadsheetId] = useState(() => {
    if (typeof window !== "undefined") {
      return process.env.NEXT_PUBLIC_GOOGLE_SHEETS_SPREADSHEET_ID || localStorage.getItem("sheets-spreadsheet-id") || "";
    }
    return process.env.NEXT_PUBLIC_GOOGLE_SHEETS_SPREADSHEET_ID || "";
  });
  const [sheetsTabName, setSheetsTabName] = useState("");
  const [isCommittingToSheets, setIsCommittingToSheets] = useState(false);
  const [sheetsProgress, setSheetsProgress] = useState("");

  const [softwareName, setSoftwareName] = useState("");
  const [useCases, setUseCases] = useState<UseCaseEntry[]>(() => [...INITIAL_USE_CASES]);
  const [collapsedInstructions, setCollapsedInstructions] = useState<boolean[]>([]);

  // Prompt Preset state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [globalRules, setGlobalRules] = useState<string>("");
  const [activeSoloPresetId, setActiveSoloPresetId] = useState<string | null>(null);
  const [activeMasterclassPresetId, setActiveMasterclassPresetId] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<PromptPreset | null>(null);
  const [promptEditorMode, setPromptEditorMode] = useState<"solo" | "masterclass">("solo");
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [promptSaveError, setPromptSaveError] = useState<string | null>(null);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);

  // Architect state (two-pass is now standard)
  const [reviewStrategy, setReviewStrategy] = useState(false);
  const [architectDNA, setArchitectDNA] = useState<ArchitectDNA | null>(null);
  const [isRunningArchitect, setIsRunningArchitect] = useState(false);
  const [showDNAInspector, setShowDNAInspector] = useState(false);
  const [dnaCollapsed, setDnaCollapsed] = useState(true);

  // Pronunciation Table state
  const [pronunciationTable, setPronunciationTable] = useState<PronunciationEntry[]>([]);
  const [showPronunciationEditor, setShowPronunciationEditor] = useState(false);

  // ── Ava UI state ────────────────────────────────────────────────
  const [macStatus, setMacStatus] = useState<{
    online: boolean;
    status: "online" | "idle" | "offline" | "processing";
    lastSeen: string | null;
    currentJob: string | null;
    jobsProcessedToday: number;
    queueDepth: number;
    hasPendingCrawl: boolean;
  } | null>(null);
  const [avaFolders, setAvaFolders] = useState<any[]>([]);
  const [avaExpandedId, setAvaExpandedId] = useState<string | null>(null);
  const [avaLoading, setAvaLoading] = useState<string | null>(null); // folderId currently actioning
  const [isScanning, setIsScanning] = useState(false);
  const [avaMessage, setAvaMessage] = useState<string | null>(null);

  const masterclassSettingsReady =
    Boolean(title.trim() && softwareName.trim()) &&
    targetWordCount >= 100 &&
    targetWordCount <= 10000;
  const masterclassBuilderReady =
    useCases.length >= 2 &&
    useCases.every((u) => u.taskName.trim() && u.instructions.trim());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("ai-mastery-auth");
    if (stored === "true") {
      setIsAuthorized(true);
    }
    
    // Load active presets from localStorage
    const savedSolo = window.localStorage.getItem("activeSoloPresetId");
    const savedMasterclass = window.localStorage.getItem("activeMasterclassPresetId");
    if (savedSolo) setActiveSoloPresetId(savedSolo);
    if (savedMasterclass) setActiveMasterclassPresetId(savedMasterclass);

    // Fetch library
    fetch("/api/prompts")
      .then(res => res.json())
      .then(data => {
        if (data.presets) setPresets(data.presets);
        if (data.db && data.db.globalRules !== undefined) {
          setGlobalRules(data.db.globalRules);
        }
        if (data.db && data.db.pronunciationTable) {
          setPronunciationTable(data.db.pronunciationTable);
        }
      })
      .catch(console.error);

    // Poll mac status every 30 seconds
    const pollMacStatus = () => {
      fetch("/api/mac-status")
        .then(res => res.json())
        .then(data => setMacStatus(data))
        .catch(() => {});
    };
    pollMacStatus();
    const macStatusInterval = setInterval(pollMacStatus, 30000);

    // Poll Ava folders — smart interval
    let avaInterval: NodeJS.Timeout;
    const pollAvaFolders = () => {
      fetch("/api/factory-folders")
        .then(res => res.json())
        .then(data => {
          if (data.folders) {
            setAvaFolders(data.folders);
            // Use faster polling if any folder is actively rendering
            const hasActive = data.folders.some((f: any) => f.stage === "rendering");
            clearInterval(avaInterval);
            avaInterval = setInterval(pollAvaFolders, hasActive ? 15000 : 30000);
          }
        })
        .catch(() => {});
    };
    pollAvaFolders();
    avaInterval = setInterval(pollAvaFolders, 30000);

    // Poll Manual folders
    let manualInterval: NodeJS.Timeout;
    const pollManualFolders = () => {
      fetch("/api/manual-folders")
        .then(res => res.json())
        .then(data => {
          if (data.folders) {
            setManualFolders(data.folders);
            // Faster polling if any folder is actively rendering
            const hasActive = data.folders.some((f: any) => f.stage === "rendering");
            clearInterval(manualInterval);
            manualInterval = setInterval(pollManualFolders, hasActive ? 5000 : 15000);
          }
        })
        .catch(() => {});
    };
    pollManualFolders();
    manualInterval = setInterval(pollManualFolders, 15000);

    return () => {
      clearInterval(macStatusInterval);
      clearInterval(avaInterval);
      clearInterval(manualInterval);
    };
  }, []);


  useEffect(() => {
    if (pinInput.length !== 6) return;
    if (pinInput === PIN_CODE) {
      setError(null);
      setIsUnlocking(true);
      const t = setTimeout(() => {
        setIsAuthorized(true);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("ai-mastery-auth", "true");
        }
      }, 1200);
      return () => clearTimeout(t);
    }
    setError("Incorrect PIN");
    const t = setTimeout(() => {
      setPinInput("");
      setError(null);
    }, 800);
    return () => clearTimeout(t);
  }, [pinInput]);

  useEffect(() => {
    if (isAuthorized || isUnlocking) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9" && pinInput.length < 6) {
        setPinInput((prev) => prev + e.key);
        setError(null);
      } else if (e.key === "Backspace") {
        setPinInput("");
        setError(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAuthorized, isUnlocking, pinInput.length]);

  const handlePinPad = (digit: string) => {
    if (digit === "back") {
      setPinInput("");
      setError(null);
      return;
    }
    if (pinInput.length < 6) {
      setPinInput((prev) => prev + digit);
      setError(null);
    }
  };

  const handleGenerateScript = async (overrideDNA?: ArchitectDNA) => {
    if (!title.trim() || !instructions.trim()) {
      setError("Please fill in both title and instructions");
      return;
    }

    setIsGeneratingScript(true);
    setError(null);
    setScript("");
    setAudioUrl(null);

    try {
      const minWordCountSingle = targetWordCount - 50;
      const maxWordCountSingle = targetWordCount + 50;
      const activePreset = presets.find(p => p.id === activeSoloPresetId);
      const wpm = activePreset?.wpm || 150;

      let dnaToUse = overrideDNA || null;

      // Pass 1: Run Architect (always, unless DNA was already provided)
      if (!dnaToUse) {
        setIsRunningArchitect(true);
        try {
          const architectRes = await fetch("/api/run-architect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              instructions,
              targetWordCount,
              wpm,
              itemLabel: "step",
            }),
          });
          if (!architectRes.ok) {
            const errData = await architectRes.json();
            throw new Error(errData.error || "Architect analysis failed");
          }
          const { dna } = await architectRes.json();
          dnaToUse = dna;
          setArchitectDNA(dna);
          setIsRunningArchitect(false);

          // If "Review Strategy" is checked, pause here for user review
          if (reviewStrategy) {
            setShowDNAInspector(true);
            setDnaCollapsed(false);
            setIsGeneratingScript(false);
            return; // User reviews DNA, then clicks "Generate Script with DNA"
          }
        } catch (archErr) {
          setIsRunningArchitect(false);
          console.error("Architect failed, continuing without DNA:", archErr);
          // Don't block — continue to Performer without DNA
        }
      }

      // Pass 2: Run Performer
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          minWordCount: minWordCountSingle,
          maxWordCount: maxWordCountSingle,
          targetWordCount,
          instructions,
          presetId: activePreset?.id,
          ...(dnaToUse ? { architectDNA: dnaToUse } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate script");
      }

      const data = await response.json();
      setScript(data.script);
      // Show DNA inspector collapsed (for debugging) after seamless runs
      if (dnaToUse) {
        setShowDNAInspector(true);
        setDnaCollapsed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateMasterclassScript = async (overrideDNA?: ArchitectDNA) => {
    if (!title.trim() || !softwareName.trim()) {
      setError("Please fill in title and software name");
      return;
    }
    const missing = useCases.find((u) => !u.taskName.trim() || !u.instructions.trim());
    if (missing) {
      setError("Each use case must have a task name and instructions");
      return;
    }

    setIsGeneratingScript(true);
    setError(null);
    setScript("");
    setAudioUrl(null);

    try {
      const minWordCountMaster = targetWordCount - 50;
      const maxWordCountMaster = targetWordCount + 50;
      const activePreset = presets.find(p => p.id === activeMasterclassPresetId);
      const wpm = activePreset?.wpm || 150;

      let dnaToUse = overrideDNA || null;

      // Pass 1: Run Architect (always)
      if (!dnaToUse) {
        setIsRunningArchitect(true);
        const serializedUseCases = useCases
          .map((u) => `Task: ${u.taskName}\nInstructions:\n${u.instructions}`)
          .join("\n\n---\n\n");
        try {
          const architectRes = await fetch("/api/run-architect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title,
              instructions: serializedUseCases,
              targetWordCount,
              wpm,
              numberOfItems: useCases.length,
              itemLabel: "use case",
            }),
          });
          if (!architectRes.ok) {
            const errData = await architectRes.json();
            throw new Error(errData.error || "Architect analysis failed");
          }
          const { dna } = await architectRes.json();
          dnaToUse = dna;
          setArchitectDNA(dna);
          setIsRunningArchitect(false);

          if (reviewStrategy) {
            setShowDNAInspector(true);
            setDnaCollapsed(false);
            setIsGeneratingScript(false);
            return;
          }
        } catch (archErr) {
          setIsRunningArchitect(false);
          console.error("Architect failed, continuing without DNA:", archErr);
        }
      }

      // Pass 2: Run Performer
      const response = await fetch("/api/generate-script-masterclass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          softwareName,
          minWordCount: minWordCountMaster,
          maxWordCount: maxWordCountMaster,
          targetWordCount,
          useCases,
          presetId: activePreset?.id,
          ...(dnaToUse ? { architectDNA: dnaToUse } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate script");
      }

      const data = await response.json();
      setScript(data.script);
      if (dnaToUse) {
        setShowDNAInspector(true);
        setDnaCollapsed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!script.trim()) {
      setError("Please generate a script first");
      return;
    }

    setIsGeneratingAudio(true);
    setError(null);
    setAudioUrl(null);
    setAudioFormat("mp3");

    try {
      const response = await fetch("/api/generate-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: script,
          provider: voiceProvider,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate audio");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const ext = blob.type === "audio/wav" ? "wav" : "mp3";
      setAudioFormat(ext);
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleDownloadAudio = () => {
    if (!audioUrl) return;

    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `${title || "script"}.${audioFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFormatForGeminiTTS = () => {
    if (!script.trim()) {
      setError("No script to format");
      return;
    }

    // Format for Gemini TTS: two lines of ellipses between sentences
    // so the AI takes a distinct "breath" between every thought.
    // Find every sentence ending (. or ?) followed by space or newline.
    // Replace with: .\n...\n...\n or ?\n...\n...\n
    const formatted = script.replace(/([.?])\s+/g, "$1\n...\n...\n");

    setScript(formatted.trim());
  };

  const handleGenerateChapters = async () => {
    if (!driveFileId.trim()) {
      setError("Please enter a Google Drive file ID");
      return;
    }

    setIsGeneratingChapters(true);
    setError(null);
    setChapters("");
    setChapterFileName("");
    setChaptersCopied(false);

    try {
      const response = await fetch("/api/generate-chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFileId: driveFileId.trim(),
          videoTitle: chapterVideoTitle.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate chapters");
      }

      const data = await response.json();
      setChapters(data.chapters);
      setChapterFileName(data.fileName || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsGeneratingChapters(false);
    }
  };

  /** Parse raw text into a deduplicated, capped array of Drive IDs. */
  const parseIds = (raw: string): string[] => {
    const ids = raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return [...new Set(ids)].slice(0, 20);
  };

  const handleGenerateMultiId = async () => {
    const ids = parseIds(multiIdInput);
    if (ids.length === 0) {
      setError("Please paste at least one Google Drive file ID.");
      return;
    }

    setIsGeneratingBatch(true);
    setError(null);
    setChapters("");
    setBatchProgress("Fetching file metadata...");
    setBatchFiles([]);
    setBatchComplete(false);
    batchAbortRef.current = false;

    try {
      // ── Preflight: resolve Drive filenames and sort A→Z (Golden Rule) ──
      const metaResponse = await fetch("/api/drive-files-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: ids }),
      });

      if (!metaResponse.ok) {
        const errorData = await metaResponse.json();
        throw new Error(errorData.error || "Failed to fetch file metadata");
      }

      const metaData = await metaResponse.json();
      const resolvedFiles: BatchFile[] = (metaData.files || []).map((f: any) => ({
        id: f.id,
        name: f.name ?? f.id, // fallback to raw ID if name unavailable
        status: f.error ? "error" as const : "pending" as const,
        error: f.error,
        errorCategory: f.errorCategory,
      }));

      if (resolvedFiles.length === 0) {
        throw new Error("No files could be resolved from the provided IDs.");
      }

      setBatchFiles(resolvedFiles);
      setBatchProgress(`Found ${resolvedFiles.length} file(s). Processing...`);

      let aggregatedChapters = "";

      // ── Sequential processing loop (reuses same engine as folder batch) ──
      for (let i = 0; i < resolvedFiles.length; i++) {
        if (batchAbortRef.current) {
          setBatchProgress(`Batch stopped by user at Video ${i} of ${resolvedFiles.length}`);
          break;
        }

        const file = resolvedFiles[i];

        // Skip files that already failed in the preflight (invalid IDs)
        if (file.status === "error") {
          continue;
        }

        setBatchFiles((prev) =>
          prev.map((f, idx) => idx === i ? { ...f, status: "processing" } : f)
        );
        setBatchProgress(`Processing Video ${i + 1} of ${resolvedFiles.length}: ${file.name}`);

        try {
          const response = await fetch("/api/generate-chapters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driveFileId: file.id,
              videoTitle: file.name.replace(/\.[^/.]+$/, ""),
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            const errorCategory = errorData.errorCategory || "UNKNOWN";
            throw Object.assign(
              new Error(errorData.error || "Failed to generate chapters"),
              { errorCategory }
            );
          }

          const data = await response.json();
          const newChapters = data.chapters;

          const block = `# ${data.title || file.name}\n${newChapters}\n\n`;
          aggregatedChapters += block;
          setChapters(aggregatedChapters);

          setBatchFiles((prev) =>
            prev.map((f, idx) => idx === i ? {
              ...f,
              status: "success",
              chapters: newChapters,
              title: data.title,
              thumbnailText: data.thumbnailText,
              tags: data.tags,
              description: data.description,
              sheetsStatus: "pending",
            } : f)
          );
        } catch (err: any) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          const errorCategory = err?.errorCategory || "UNKNOWN";
          setBatchFiles((prev) =>
            prev.map((f, idx) => idx === i ? { ...f, status: "error", error: errorMessage, errorCategory } : f)
          );
        }
      }

      if (!batchAbortRef.current) {
        setBatchProgress("Batch processing complete!");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setBatchProgress("Batch failed.");
    } finally {
      setIsGeneratingBatch(false);
      setBatchComplete(true);
    }
  const handleForceExportToSheets = async (folder: any) => {
    try {
      const exportFiles = (folder.videoResults || [])
        .filter((f: any) => f.metadataStatus === "done")
        .map((f: any) => ({
          filename: f.filename,
          title: f.title || "",
          thumbnailText: f.thumbnailText || "",
          chapters: f.chapters || "",
          description: f.description || "",
          tags: f.tags || ""
        }));

      if (exportFiles.length === 0) {
        alert("No completed videos to export.");
        return;
      }

      const res = await fetch("/api/export-batch-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: spreadsheetId.trim(),
          tabName: folder.sheetTabName?.trim() || folder.path,
          folderLink: `https://drive.google.com/drive/folders/${folder.folderId}`,
          videos: exportFiles,
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Sheets export failed");
      }
      
      alert(`Successfully pushed ${exportFiles.length} videos to Google Sheets!`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleAddToQueue = async () => {
    if (!driveFolderId.trim()) {
      setError("Please enter a Google Drive Folder ID");
      return;
    }

    setIsAddingToQueue(true);
    setError(null);

    try {
      // 1. Fetch from Drive API
      const listResponse = await fetch(`/api/drive-folder?folderId=${encodeURIComponent(driveFolderId.trim())}`);
      if (!listResponse.ok) {
        const errorData = await listResponse.json();
        throw new Error(errorData.error || "Failed to fetch folder contents");
      }

      const listData = await listResponse.json();
      const files = (listData.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
      }));

      if (files.length === 0) {
        throw new Error("No video files found in the specified folder.");
      }

      const fName = listData.folderName || "";
      const prefix = softwareName.trim() ? `${softwareName.trim()} ` : "";
      const sTabName = `${prefix}${fName || "Videos"}`;

      // 2. Queue the export
      const payload = {
         folderId: driveFolderId.trim(),
         folderName: fName,
         sheetTabName: sTabName,
         files: files
      };

      const res = await fetch("/api/queue-manual-export", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(payload)
      });

      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.error || "Failed to queue folder");
      }

      // 3. Clear the input so they can add another
      setDriveFolderId("");
      
      // Force an immediate refresh of the manual folders dashboard
      fetch("/api/manual-folders")
        .then(r => r.json())
        .then(data => { if(data.folders) setManualFolders(data.folders); })
        .catch(() => {});

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to queue.");
    } finally {
      setIsAddingToQueue(false);
    }
  };

  const handleRegenerateFailedFolder = async (folderId: string, folderName: string, sheetTabName: string) => {
    try {
      // Just re-trigger the queue-manual-export endpoint for this folder
      // The backend handles looking it up and triggering an export action
      await fetch("/api/queue-manual-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, folderName, sheetTabName, files: [] }) // files array not needed if it exists
      });
      // Force refresh
      fetch("/api/manual-folders").then(r => r.json()).then(data => { if(data.folders) setManualFolders(data.folders); });
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearFolder = async (folderId: string) => {
    try {
      await fetch("/api/delete-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId })
      });
      setManualFolders(prev => prev.filter(f => f.folderId !== folderId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopBatch = () => {
    batchAbortRef.current = true;
  };

  const handleCopyErrorLog = () => {
    const failures = batchFiles.filter((f) => f.status === "error");
    if (failures.length === 0) return;
    const log = failures
      .map((f, i) => `${i + 1}. ${f.name}\n   Category: ${f.errorCategory || "UNKNOWN"}\n   Error: ${f.error}`)
      .join("\n\n");
    const header = `Batch Error Log — ${failures.length} failure(s)\n${"=".repeat(40)}\n\n`;
    navigator.clipboard.writeText(header + log);
  };

  const handleSavePrompt = async (asNew: boolean, forceSave = false) => {
    if (!editingPreset) return;
    setIsSavingPrompt(true);
    setPromptSaveError(null);

    const presetToSave = {
      ...editingPreset,
      id: asNew ? "" : editingPreset.id,
      name: asNew ? `${editingPreset.name} (Copy)` : editingPreset.name,
    };

    const payload = {
      action: "savePreset",
      preset: presetToSave
    };

    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save prompt");
      }

      setPresets(data.presets);
      
      const newActiveId = data.savedId;
      if (promptEditorMode === "solo") {
        setActiveSoloPresetId(newActiveId);
        window.localStorage.setItem("activeSoloPresetId", newActiveId);
      } else {
        setActiveMasterclassPresetId(newActiveId);
        window.localStorage.setItem("activeMasterclassPresetId", newActiveId);
      }

      setEditingPreset(null);
      // Removed setShowPromptSettings(false) since we are inline now
    } catch (err: any) {
      setPromptSaveError(err.message);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleResetPrompts = async () => {
    if (!confirm("Are you sure? This will delete ALL custom presets and reset to the factory defaults. This cannot be undone.")) return;
    try {
      const res = await fetch("/api/prompts", { method: "DELETE" });
      const data = await res.json();
      setPresets(data.presets);
      
      const defaultSolo = data.presets.find((p: PromptPreset) => p.isDefault && p.type === "solo");
      const defaultMaster = data.presets.find((p: PromptPreset) => p.isDefault && p.type === "masterclass");
      
      if (defaultSolo) {
        setActiveSoloPresetId(defaultSolo.id);
        window.localStorage.setItem("activeSoloPresetId", defaultSolo.id);
      }
      if (defaultMaster) {
        setActiveMasterclassPresetId(defaultMaster.id);
        window.localStorage.setItem("activeMasterclassPresetId", defaultMaster.id);
      }
      setEditingPreset(null);
    } catch (err) {
      console.error(err);
      alert("Failed to reset prompts");
    }
  };

  const handleSelectPreset = (id: string) => {
    if (promptEditorMode === "solo") {
      setActiveSoloPresetId(id);
      window.localStorage.setItem("activeSoloPresetId", id);
    } else {
      setActiveMasterclassPresetId(id);
      window.localStorage.setItem("activeMasterclassPresetId", id);
    }
  };

  useEffect(() => {
    if (showHistoryModal) {
      fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getHistory" })
      })
      .then(r => r.json())
      .then(d => {
        if (d.history) setHistoryData(d.history);
      })
      .catch(console.error);
    }
  }, [showHistoryModal]);

  const handleRestoreVersion = async (index: number) => {
    if (!confirm("Are you sure you want to restore this version? All current presets will be overwritten.")) return;
    setIsRestoring(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restoreVersion", index })
      });
      const data = await res.json();
      if (data.db) {
        setPresets(data.db.presets || []);
        setGlobalRules(data.db.globalRules || "");
        setShowHistoryModal(false);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to restore version.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleCommitToSheets = async () => {
    if (!spreadsheetId.trim()) {
      setError("Please enter a Spreadsheet ID");
      return;
    }
    if (!sheetsTabName.trim()) {
      setError("Please enter a Tab Name");
      return;
    }

    // Persist spreadsheet ID to localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("sheets-spreadsheet-id", spreadsheetId.trim());
    }

    const successFiles = batchFiles.filter((f) => f.status === "success");
    if (successFiles.length === 0) {
      setError("No successfully processed videos to commit.");
      return;
    }

    setIsCommittingToSheets(true);
    setSheetsProgress("Starting Sheets write...");

    // Get the indices of successful files in the ORIGINAL sorted order
    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      if (file.status !== "success" || !file.chapters) continue;

      setBatchFiles((prev) =>
        prev.map((f, idx) => idx === i ? { ...f, sheetsStatus: "writing" } : f)
      );
      setSheetsProgress(`Writing to Sheets: ${file.title || file.name}`);

      try {
        const response = await fetch("/api/write-sheets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spreadsheetId: spreadsheetId.trim(),
            tabName: sheetsTabName.trim(),
            rowIndex: i, // Alphabetical order = row order (Golden Rule)
            data: {
              title: file.title || file.name,
              thumbnailText: file.thumbnailText || "",
              chapters: file.chapters || "",
              description: file.description || "",
              tags: file.tags || "",
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to write to Sheets");
        }

        setBatchFiles((prev) =>
          prev.map((f, idx) => idx === i ? { ...f, sheetsStatus: "written" } : f)
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Sheets write failed";
        setBatchFiles((prev) =>
          prev.map((f, idx) => idx === i ? { ...f, sheetsStatus: "error", sheetsError: errorMessage } : f)
        );
      }

      // 1-second delay between writes to respect rate limits
      await new Promise((r) => setTimeout(r, 1000));
    }

    setSheetsProgress("Sheets commit complete!");
    setIsCommittingToSheets(false);
  };

  const handleCopyChapters = () => {
    if (!chapters.trim()) return;
    navigator.clipboard.writeText(chapters).then(() => {
      setChaptersCopied(true);
      setTimeout(() => setChaptersCopied(false), 2000);
    });
  };

  if (!isAuthorized) {
    return (
      <main className="min-h-screen bg-[#0c0c0d] flex items-center justify-center p-4">
        <div className="ink-panel max-w-[280px] w-full p-5 space-y-5">
          {isUnlocking ? (
            <div className="flex flex-col items-center justify-center py-8 unlock-fade-in">
              <div className="rounded-full bg-emerald-500/20 border border-emerald-500/50 p-4 mb-3 unlock-scale">
                <Check className="w-10 h-10 text-emerald-400" strokeWidth={2.5} />
              </div>
              <p className="text-sm font-medium text-emerald-400 uppercase tracking-wider">
                Unlocked
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-[#8a8a8b] text-center uppercase tracking-wider">
                Enter PIN
              </p>
              {error && (
                <div className="p-2 rounded-[6px] border border-[#262626] bg-red-950/30 text-red-400 text-xs text-center">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handlePinPad(d)}
                    className="ink-input py-3 text-[#e2e2e2] font-medium text-lg hover:bg-[#1e1e20] transition-colors rounded-[6px]"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handlePinPad("back")}
                  className="ink-input py-3 text-[#8a8a8b] text-sm hover:bg-[#1e1e20] transition-colors rounded-[6px] col-span-1"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handlePinPad("0")}
                  className="ink-input py-3 text-[#e2e2e2] font-medium text-lg hover:bg-[#1e1e20] transition-colors rounded-[6px] col-span-2"
                >
                  0
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    );
  }

  const panelClass = "ink-panel p-4";
  const inputBase =
    "ink-input w-full px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const labelClass = "ink-label block mb-1.5";

  return (
    <main className="min-h-screen bg-[#0c0c0d] text-[#e2e2e2] p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {error && (
          <div className="ink-panel p-3 border-red-900/50 bg-red-950/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`px-3 py-2 text-sm font-medium rounded-[6px] border transition-colors flex items-center gap-1.5 ${
                mode === "single"
                  ? "bg-[#161618] text-[#e2e2e2] border-[#262626]"
                  : "border-transparent text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#161618] hover:border-[#262626]"
              }`}
            >
<Target className="w-3.5 h-3.5" />
            Solo
            </button>
            <button
              type="button"
              onClick={() => setMode("masterclass")}
              className={`px-3 py-2 text-sm font-medium rounded-[6px] border transition-colors flex items-center gap-1.5 ${
                mode === "masterclass"
                  ? "bg-[#161618] text-[#e2e2e2] border-[#262626]"
                  : "border-transparent text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#161618] hover:border-[#262626]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Masterclass
            </button>
            <button
              type="button"
              onClick={() => setMode("chapters")}
              className={`px-3 py-2 text-sm font-medium rounded-[6px] border transition-colors flex items-center gap-1.5 ${
                mode === "chapters"
                  ? "bg-[#161618] text-[#e2e2e2] border-[#262626]"
                  : "border-transparent text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#161618] hover:border-[#262626]"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              Chapters
            </button>
            <button
              type="button"
              onClick={() => setMode("factory")}
              className={`px-3 py-2 text-sm font-medium rounded-[6px] border transition-colors flex items-center gap-1.5 ${
                mode === "factory"
                  ? "bg-[#161618] text-[#e2e2e2] border-[#262626]"
                  : "border-transparent text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#161618] hover:border-[#262626]"
              }`}
            >
              <span className="text-[13px] leading-none">🏭</span>
              Ava
              {macStatus && (
                <span className={`w-2 h-2 rounded-full ml-0.5 ${
                  macStatus.status === "processing" ? "bg-blue-400 animate-pulse" :
                  macStatus.online ? "bg-emerald-400" : "bg-red-400"
                }`} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="px-3 py-2 text-sm font-medium rounded-[6px] border border-transparent text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#161618] hover:border-[#262626] transition-colors flex items-center gap-1.5 ml-2"
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsUnlocking(false);
              setIsAuthorized(false);
            }}
            className="px-3 py-2 rounded-[6px] border border-transparent text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#161618] hover:border-[#262626] transition-colors"
            title="Log out"
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>

        {mode === "single" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Column - Single Use Case Form */}
            <div className={panelClass}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[#e2e2e2]">
                <FileText className="w-4 h-4 text-[#8a8a8b]" />
                Input Details
              </h2>

              <div className="space-y-3">
                <div>
                  <label htmlFor="title" className={labelClass}>
                    Video Title
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter video title"
                    className={inputBase}
                    disabled={isGeneratingScript || isGeneratingAudio}
                  />
                </div>

                <div>
                  <label htmlFor="targetWordCount" className={labelClass}>
                    Target Word Count
                  </label>
                  <input
                    id="targetWordCount"
                    type="number"
                    value={targetWordCount}
                    onChange={(e) => setTargetWordCount(Number(e.target.value))}
                    min="100"
                    max="10000"
                    className={`${inputBase} no-number-spinner`}
                    disabled={isGeneratingScript || isGeneratingAudio}
                  />
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-[#8a8a8b]">
                    Range: {targetWordCount - 50} – {targetWordCount + 50} words
                  </p>
                </div>

                <div>
                  <label htmlFor="instructions" className={labelClass}>
                    Instructions
                  </label>
                  <textarea
                    id="instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Enter your HTML instructions or step-by-step guide here..."
                    rows={10}
                    className={`${inputBase} font-mono resize-none`}
                    disabled={isGeneratingScript || isGeneratingAudio}
                  />
                </div>

                <div className="pt-3 border-t border-[#262626] mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelClass} style={{ marginBottom: 0 }}>System Prompt Preset</label>
                    <button 
                      type="button"
                      onClick={() => { 
                        if (editingPreset && promptEditorMode === "solo") {
                          setEditingPreset(null);
                        } else {
                          setPromptEditorMode("solo"); 
                          setEditingPreset(presets.find(p => p.id === activeSoloPresetId) || presets.find(p => p.type === "solo" && p.isDefault) || null); 
                        }
                      }}
                      className="text-[11px] font-medium text-[#8a8a8b] hover:text-[#e2e2e2] transition-colors"
                    >
                      {editingPreset && promptEditorMode === "solo" ? "Close Editor" : "Edit / Clone"}
                    </button>
                  </div>
                  
                  {editingPreset && promptEditorMode === "solo" ? (
                    <PresetEditor 
                      preset={editingPreset}
                      globalRules={globalRules}
                      onChange={setEditingPreset}
                      onSave={handleSavePrompt}
                      onSaveGlobalRules={(val) => {
                        setGlobalRules(val);
                        // Auto-save global rules
                        fetch("/api/prompts", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "saveGlobalRules", globalRules: val }),
                        }).catch(console.error);
                      }}
                      isSaving={isSavingPrompt}
                      error={promptSaveError}
                    />
                  ) : (
                    <select
                      value={activeSoloPresetId || ""}
                      onChange={(e) => {
                        setPromptEditorMode("solo");
                        handleSelectPreset(e.target.value);
                      }}
                      className={inputBase}
                      disabled={isGeneratingScript || isGeneratingAudio}
                    >
                      {presets.filter(p => p.type === "solo").map(p => (
                        <option key={p.id} value={p.id}>{p.name} {p.isDefault ? "(Factory Default)" : ""}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleGenerateScript()}
                    disabled={isGeneratingScript || isGeneratingAudio || isRunningArchitect}
                    className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2"
                  >
                    {isRunningArchitect ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : isGeneratingScript ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Writing script...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        Generate Script
                      </>
                    )}
                  </button>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Pause after AI analysis to review and edit the script strategy before generating">
                    <input
                      type="checkbox"
                      checked={reviewStrategy}
                      onChange={(e) => setReviewStrategy(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[#3a3a3a] bg-[#161618] text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                    />
                    <span className="text-[11px] text-[#8a8a8b]">Review Strategy</span>
                  </label>
                  <span className="text-[11px] uppercase tracking-wider text-[#8a8a8b] px-2 py-1 rounded-[6px] border border-[#262626] bg-[#161618]">
                    ⌘ + Enter
                  </span>
                </div>

                {/* DNA Inspector Panel */}
                {showDNAInspector && architectDNA && mode === "single" && (
                  <div className="mt-3 border border-amber-500/30 rounded-[6px] bg-amber-500/5 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setDnaCollapsed(!dnaCollapsed)}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-amber-500/10 transition-colors"
                    >
                      <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        ⚡ Script DNA {dnaCollapsed ? "(click to expand)" : "— Review & Edit"}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#8a8a8b]">
                          {architectDNA.hookStyle} · {architectDNA.timingMap.steps.length} steps
                        </span>
                        <X
                          className="w-3.5 h-3.5 text-[#8a8a8b] hover:text-[#e2e2e2]"
                          onClick={(e) => { e.stopPropagation(); setShowDNAInspector(false); setArchitectDNA(null); }}
                        />
                      </div>
                    </button>

                    {!dnaCollapsed && (
                      <div className="p-3 pt-0 space-y-3">
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Pain Point</label>
                            <input type="text" value={architectDNA.painPoint} onChange={(e) => setArchitectDNA({...architectDNA, painPoint: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Authority Anchor</label>
                            <input type="text" value={architectDNA.authorityAnchor} onChange={(e) => setArchitectDNA({...architectDNA, authorityAnchor: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Core Transformation</label>
                            <input type="text" value={architectDNA.coreTransformation} onChange={(e) => setArchitectDNA({...architectDNA, coreTransformation: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Hook Style</label>
                              <select value={architectDNA.hookStyle} onChange={(e) => setArchitectDNA({...architectDNA, hookStyle: e.target.value as ArchitectDNA["hookStyle"]})} className="ink-input w-full px-2 py-1.5 text-xs">
                                <option value="result-led">Result-led (Proof first)</option>
                                <option value="experience-led">Experience-led (Authority first)</option>
                                <option value="problem-led">Problem-led (Pain first)</option>
                              </select>
                            </div>
                            <div className="flex items-end">
                              <div className="text-[10px] text-[#8a8a8b]">
                                Hook: {architectDNA.timingMap.hookSeconds}s · Bridge: {architectDNA.timingMap.bridgeSeconds}s · Close: {architectDNA.timingMap.closingSeconds}s
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Hook Draft</label>
                            <textarea value={architectDNA.hookDraft} onChange={(e) => setArchitectDNA({...architectDNA, hookDraft: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs min-h-[50px] resize-y" />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Bridge Draft</label>
                            <textarea value={architectDNA.bridgeDraft} onChange={(e) => setArchitectDNA({...architectDNA, bridgeDraft: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs min-h-[40px] resize-y" />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] uppercase text-[#8a8a8b] mb-1 block">Step Timing Allocation</label>
                          <div className="space-y-1">
                            {architectDNA.timingMap.steps.map((step, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px] text-[#c0c0c0] bg-[#0c0c0d] px-2 py-1 rounded">
                                <span className="text-[#8a8a8b] w-4 text-right">{i + 1}.</span>
                                <span className="flex-1 truncate">{step.name}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold ${
                                  step.complexity === "complex" ? "bg-red-500/10 text-red-400" :
                                  step.complexity === "moderate" ? "bg-amber-500/10 text-amber-400" :
                                  "bg-green-500/10 text-green-400"
                                }`}>{step.complexity}</span>
                                <span className="text-[#8a8a8b] w-10 text-right">{step.allocatedSeconds}s</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => handleGenerateScript(architectDNA)}
                          disabled={isGeneratingScript}
                          className="ink-btn-primary w-full px-4 py-2 text-sm font-medium flex items-center justify-center gap-2"
                        >
                          {isGeneratingScript ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Writing with DNA...
                            </>
                          ) : (
                            <>
                              <FileText className="w-4 h-4" />
                              Regenerate Script with DNA
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Script & Audio */}
            <div className={panelClass}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[#e2e2e2]">
                <FileText className="w-4 h-4 text-[#8a8a8b]" />
                Generated Script
              </h2>

              <button
                onClick={handleFormatForGeminiTTS}
                disabled={!script.trim() || isGeneratingScript || isGeneratingAudio}
                className="w-full mb-3 px-3 py-2 ink-input text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-[#8a8a8b]"
              >
                <FileText className="w-3.5 h-3.5" />
                Format for Gemini TTS
              </button>

              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Generated script will appear here..."
                rows={14}
                className={`${inputBase} resize-none`}
                disabled={isGeneratingScript || isGeneratingAudio}
              />

              {script && (
                <div className="mt-1.5 text-[11px] uppercase tracking-wider text-[#8a8a8b]">
                  Word count: {script.trim().split(/\s+/).filter(word => word.length > 0).length} words
                </div>
              )}

              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="voiceProvider" className={labelClass}>
                    Voice Provider
                  </label>
                  <select
                    id="voiceProvider"
                    value={voiceProvider}
                    onChange={(e) => setVoiceProvider(e.target.value as "elevenlabs" | "fish" | "gemini")}
                    className={inputBase}
                    disabled={isGeneratingAudio || isGeneratingScript}
                  >
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="fish">Fish.audio</option>
                    <option value="gemini">Gemini TTS</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerateAudio}
                  disabled={!script.trim() || isGeneratingAudio || isGeneratingScript}
                  className="w-full px-4 py-2 ink-btn-primary text-sm font-medium flex items-center justify-center gap-2"
                >
                  {isGeneratingAudio ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Synthesizing audio...
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Generate Audio
                    </>
                  )}
                </button>

                {audioUrl && (
                  <div className="space-y-2">
                    <div className="ink-panel ink-audio-wrapper p-3">
                      <div className="flex items-center gap-2 mb-2 text-[#8a8a8b] text-[11px] uppercase tracking-wider">
                        <Play className="w-3.5 h-3.5" />
                        Audio Preview
                      </div>
                      <audio controls src={audioUrl} className="w-full" />
                    </div>

                    <button
                      onClick={handleDownloadAudio}
                      className="w-full px-4 py-2 rounded-[6px] border border-[#262626] bg-[#161618] text-sm text-[#e2e2e2] hover:bg-[#1a1a1c] flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download {audioFormat.toUpperCase()}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : mode === "masterclass" ? (
          <div className="space-y-6 w-full">
            {/* Row 1 - Settings */}
            <div className={panelClass}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[#e2e2e2]">
                <Settings className="w-4 h-4 text-[#8a8a8b]" />
                Settings
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${
                    masterclassSettingsReady ? "bg-emerald-500" : "bg-red-500"
                  }`}
                  aria-label={masterclassSettingsReady ? "Settings complete" : "Settings incomplete"}
                />
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="master-title" className={labelClass}>
                    Video Title
                  </label>
                  <input
                    id="master-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter video title"
                    className={inputBase}
                    disabled={isGeneratingScript || isGeneratingAudio}
                  />
                </div>
                <div>
                  <label htmlFor="softwareName" className={labelClass}>
                    Software Name
                  </label>
                  <input
                    id="softwareName"
                    type="text"
                    value={softwareName}
                    onChange={(e) => setSoftwareName(e.target.value)}
                    placeholder="e.g. Gemini, Photoshop"
                    className={inputBase}
                    disabled={isGeneratingScript || isGeneratingAudio}
                  />
                </div>
                <div>
                  <label htmlFor="master-targetWordCount" className={labelClass}>
                    Target Word Count
                  </label>
                  <input
                    id="master-targetWordCount"
                    type="number"
                    value={targetWordCount}
                    onChange={(e) => setTargetWordCount(Number(e.target.value))}
                    min="100"
                    max="10000"
                    className={`${inputBase} no-number-spinner`}
                    disabled={isGeneratingScript || isGeneratingAudio}
                  />
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-[#8a8a8b]">
                    Range: {targetWordCount - 50} – {targetWordCount + 50} words
                  </p>
                </div>
              </div>
            </div>

            {/* Row 2 - The Builder */}
            <div className={panelClass}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-[#e2e2e2]">
                  <LayoutList className="w-4 h-4 text-[#8a8a8b]" />
                  The Builder
                  <span
                    className={`shrink-0 w-2 h-2 rounded-full ${
                      masterclassBuilderReady ? "bg-emerald-500" : "bg-red-500"
                    }`}
                    aria-label={masterclassBuilderReady ? "Builder complete" : "Builder incomplete"}
                  />
                </h2>
                <button
                  type="button"
                  onClick={() => setUseCases((prev) => [...prev, { taskName: "", instructions: "" }])}
                  disabled={useCases.length >= 8 || isGeneratingScript || isGeneratingAudio}
                  className="flex items-center justify-center w-8 h-8 ink-input text-sm disabled:opacity-50 disabled:cursor-not-allowed text-[#8a8a8b]"
                  aria-label="Add use case"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {useCases.map((uc, index) => (
                  <div
                    key={index}
                    className="pt-2 px-3 pb-3 ink-panel space-y-2 w-full"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className={labelClass + " mb-0"}>how to...</label>
                      {useCases.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                          setUseCases((prev) => prev.filter((_, i) => i !== index));
                          setCollapsedInstructions((prev) => prev.filter((_, i) => i !== index));
                        }}
                          disabled={isGeneratingScript || isGeneratingAudio}
                          className="p-1 rounded-[6px] text-red-400 hover:bg-red-950/30 disabled:opacity-50 shrink-0"
                          aria-label={`Remove Use Case ${index + 1}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        value={uc.taskName}
                        onChange={(e) =>
                          setUseCases((prev) =>
                            prev.map((u, i) =>
                              i === index ? { ...u, taskName: e.target.value } : u
                            )
                          )}
                        placeholder="remove the background from a photo"
                        className={inputBase}
                        disabled={isGeneratingScript || isGeneratingAudio}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Instructions (HTML)</label>
                      {collapsedInstructions[index] && uc.instructions.trim() ? (
                        <div className="flex items-center gap-2 py-2 px-3 rounded-[6px] border border-[#262626] bg-[#161618] min-h-[40px]">
                          <span className="instructions-check-pop flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/50">
                            <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
                          </span>
                          <span className="text-[11px] uppercase tracking-wider text-[#8a8a8b]">Instructions added</span>
                          <button
                            type="button"
                            onClick={() => setCollapsedInstructions((prev) => {
                              const next = [...prev];
                              next[index] = false;
                              return next;
                            })}
                            disabled={isGeneratingScript || isGeneratingAudio}
                            className="ml-auto p-1 rounded-[6px] text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#1e1e20] disabled:opacity-50"
                            aria-label="Show instructions to edit or repaste"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <textarea
                          value={uc.instructions}
                          onChange={(e) =>
                            setUseCases((prev) =>
                              prev.map((u, i) =>
                                i === index ? { ...u, instructions: e.target.value } : u
                              )
                            )}
                          onBlur={() => {
                            if (uc.instructions.trim()) {
                              setCollapsedInstructions((prev) => {
                                const next = [...prev];
                                while (next.length <= index) next.push(false);
                                next[index] = true;
                                return next;
                              });
                            }
                          }}
                          placeholder="Paste HTML instructions for this use case..."
                          rows={5}
                          className={`${inputBase} font-mono resize-none transition-opacity duration-200`}
                          disabled={isGeneratingScript || isGeneratingAudio}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-[#262626] mt-5">
                <div className="flex items-center justify-between mb-2">
                  <label className={labelClass} style={{ marginBottom: 0 }}>System Prompt Preset</label>
                  <button 
                    type="button"
                    onClick={() => { 
                      if (editingPreset && promptEditorMode === "masterclass") {
                        setEditingPreset(null);
                      } else {
                        setPromptEditorMode("masterclass"); 
                        setEditingPreset(presets.find(p => p.id === activeMasterclassPresetId) || presets.find(p => p.type === "masterclass" && p.isDefault) || null); 
                      }
                    }}
                    className="text-[11px] font-medium text-[#8a8a8b] hover:text-[#e2e2e2] transition-colors"
                  >
                    {editingPreset && promptEditorMode === "masterclass" ? "Close Editor" : "Edit / Clone"}
                  </button>
                </div>
                
                {editingPreset && promptEditorMode === "masterclass" ? (
                  <PresetEditor 
                    preset={editingPreset}
                    globalRules={globalRules}
                    onChange={setEditingPreset}
                    onSave={handleSavePrompt}
                    onSaveGlobalRules={(val) => {
                      setGlobalRules(val);
                      // Auto-save global rules
                      fetch("/api/prompts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "saveGlobalRules", globalRules: val }),
                      }).catch(console.error);
                    }}
                    isSaving={isSavingPrompt}
                    error={promptSaveError}
                  />
                ) : (
                  <select
                    value={activeMasterclassPresetId || ""}
                    onChange={(e) => {
                      setPromptEditorMode("masterclass");
                      handleSelectPreset(e.target.value);
                    }}
                    className={inputBase}
                    disabled={isGeneratingScript || isGeneratingAudio}
                  >
                    {presets.filter(p => p.type === "masterclass").map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.isDefault ? "(Factory Default)" : ""}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#262626]">
                <button
                  onClick={() => handleGenerateMasterclassScript()}
                  disabled={isGeneratingScript || isGeneratingAudio || isRunningArchitect}
                  className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2"
                >
                  {isRunningArchitect ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : isGeneratingScript ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Writing script...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Generate Script
                    </>
                  )}
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Pause after AI analysis to review and edit the script strategy before generating">
                  <input
                    type="checkbox"
                    checked={reviewStrategy}
                    onChange={(e) => setReviewStrategy(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#3a3a3a] bg-[#161618] text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                  />
                  <span className="text-[11px] text-[#8a8a8b]">Review Strategy</span>
                </label>
                <span className="text-[11px] uppercase tracking-wider text-[#8a8a8b] px-2 py-1 rounded-[6px] border border-[#262626] bg-[#161618]">
                  ⌘ + Enter
                </span>
              </div>

              {/* DNA Inspector Panel — Masterclass */}
              {showDNAInspector && architectDNA && mode === "masterclass" && (
                <div className="mt-3 border border-amber-500/30 rounded-[6px] bg-amber-500/5 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDnaCollapsed(!dnaCollapsed)}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-amber-500/10 transition-colors"
                  >
                    <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      ⚡ Script DNA {dnaCollapsed ? "(click to expand)" : "— Review & Edit"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#8a8a8b]">
                        {architectDNA.hookStyle} · {architectDNA.timingMap.steps.length} use cases
                      </span>
                      <X
                        className="w-3.5 h-3.5 text-[#8a8a8b] hover:text-[#e2e2e2]"
                        onClick={(e) => { e.stopPropagation(); setShowDNAInspector(false); setArchitectDNA(null); }}
                      />
                    </div>
                  </button>

                  {!dnaCollapsed && (
                    <div className="p-3 pt-0 space-y-3">
                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Pain Point</label>
                          <input type="text" value={architectDNA.painPoint} onChange={(e) => setArchitectDNA({...architectDNA, painPoint: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs" />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Authority Anchor</label>
                          <input type="text" value={architectDNA.authorityAnchor} onChange={(e) => setArchitectDNA({...architectDNA, authorityAnchor: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Hook Style</label>
                            <select value={architectDNA.hookStyle} onChange={(e) => setArchitectDNA({...architectDNA, hookStyle: e.target.value as ArchitectDNA["hookStyle"]})} className="ink-input w-full px-2 py-1.5 text-xs">
                              <option value="result-led">Result-led (Proof first)</option>
                              <option value="experience-led">Experience-led (Authority first)</option>
                              <option value="problem-led">Problem-led (Pain first)</option>
                            </select>
                          </div>
                          <div className="flex items-end">
                            <div className="text-[10px] text-[#8a8a8b]">
                              Hook: {architectDNA.timingMap.hookSeconds}s · Bridge: {architectDNA.timingMap.bridgeSeconds}s
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Hook Draft</label>
                          <textarea value={architectDNA.hookDraft} onChange={(e) => setArchitectDNA({...architectDNA, hookDraft: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs min-h-[50px] resize-y" />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase text-[#8a8a8b] mb-0.5 block">Bridge Draft</label>
                          <textarea value={architectDNA.bridgeDraft} onChange={(e) => setArchitectDNA({...architectDNA, bridgeDraft: e.target.value})} className="ink-input w-full px-2 py-1.5 text-xs min-h-[40px] resize-y" />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase text-[#8a8a8b] mb-1 block">Use Case Timing</label>
                        <div className="space-y-1">
                          {architectDNA.timingMap.steps.map((step, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px] text-[#c0c0c0] bg-[#0c0c0d] px-2 py-1 rounded">
                              <span className="text-[#8a8a8b] w-4 text-right">{i + 1}.</span>
                              <span className="flex-1 truncate">{step.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold ${
                                step.complexity === "complex" ? "bg-red-500/10 text-red-400" :
                                step.complexity === "moderate" ? "bg-amber-500/10 text-amber-400" :
                                "bg-green-500/10 text-green-400"
                              }`}>{step.complexity}</span>
                              <span className="text-[#8a8a8b] w-10 text-right">{step.allocatedSeconds}s</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => handleGenerateMasterclassScript(architectDNA)}
                        disabled={isGeneratingScript}
                        className="ink-btn-primary w-full px-4 py-2 text-sm font-medium flex items-center justify-center gap-2"
                      >
                        {isGeneratingScript ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Writing with DNA...
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4" />
                            Regenerate Script with DNA
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Row 3 - The Output */}
            <div className={panelClass}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[#e2e2e2]">
                <FileText className="w-4 h-4 text-[#8a8a8b]" />
                The Output
              </h2>

              <button
                onClick={handleFormatForGeminiTTS}
                disabled={!script.trim() || isGeneratingScript || isGeneratingAudio}
                className="w-full mb-3 px-3 py-2 ink-input text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-[#8a8a8b]"
              >
                <FileText className="w-3.5 h-3.5" />
                Format for Gemini TTS
              </button>

              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Generated script will appear here..."
                rows={14}
                className={`${inputBase} resize-none`}
                disabled={isGeneratingScript || isGeneratingAudio}
              />

              {script && (
                <div className="mt-1.5 text-[11px] uppercase tracking-wider text-[#8a8a8b]">
                  Word count: {script.trim().split(/\s+/).filter(word => word.length > 0).length} words
                </div>
              )}

              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="voiceProvider-master" className={labelClass}>
                    Voice Provider
                  </label>
                  <select
                    id="voiceProvider-master"
                    value={voiceProvider}
                    onChange={(e) => setVoiceProvider(e.target.value as "elevenlabs" | "fish" | "gemini")}
                    className={inputBase}
                    disabled={isGeneratingAudio || isGeneratingScript}
                  >
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="fish">Fish.audio</option>
                    <option value="gemini">Gemini TTS</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerateAudio}
                  disabled={!script.trim() || isGeneratingAudio || isGeneratingScript}
                  className="w-full px-4 py-2 ink-btn-primary text-sm font-medium flex items-center justify-center gap-2"
                >
                  {isGeneratingAudio ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Synthesizing audio...
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Generate Audio
                    </>
                  )}
                </button>

                {audioUrl && (
                  <div className="space-y-2">
                    <div className="ink-panel ink-audio-wrapper p-3">
                      <div className="flex items-center gap-2 mb-2 text-[#8a8a8b] text-[11px] uppercase tracking-wider">
                        <Play className="w-3.5 h-3.5" />
                        Audio Preview
                      </div>
                      <audio controls src={audioUrl} className="w-full" />
                    </div>

                    <button
                      onClick={handleDownloadAudio}
                      className="w-full px-4 py-2 rounded-[6px] border border-[#262626] bg-[#161618] text-sm text-[#e2e2e2] hover:bg-[#1a1a1c] flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download {audioFormat.toUpperCase()}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : mode === "factory" ? (
          /* ─── Ava UI — Uploader Dashboard ─── */
          <div className="space-y-5">
            {/* iMac status + header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-base font-semibold text-[#e2e2e2] flex items-center gap-2">
                  <span className="text-lg">🏭</span>
                  Ava — Upload Manager
                </h2>
                <button
                  disabled={isScanning}
                  onClick={async () => {
                    setIsScanning(true);
                    setAvaMessage("📡 Triggering scan...");
                    try {
                      const res = await fetch("/api/factory-folders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "scan" }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      setAvaMessage(data.message);
                      // Force a poll immediately after scan is triggered
                      fetch("/api/factory-folders").then(r => r.json()).then(d => {
                         if (d.folders) {
                            setAvaFolders(d.folders);
                         }
                      });
                    } catch (err: any) {
                      setAvaMessage(`❌ ${err.message}`);
                    } finally {
                      setIsScanning(false);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-[6px] bg-[#161618] border border-[#262626] text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#1a1a1c] transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isScanning ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <span className="text-[10px]">↻</span>
                  )}
                  {isScanning ? "Scanning..." : "Scan Google Drive"}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#8a8a8b]">
                <div className={`w-2 h-2 rounded-full ${
                  !macStatus ? "bg-[#444]" :
                  macStatus.status === "processing" ? "bg-blue-400 animate-pulse" :
                  macStatus.online ? "bg-emerald-400" : "bg-red-500"
                }`} />
                {!macStatus ? "Checking..." : macStatus.online ? "iMac Online" : "iMac Offline"}
              </div>
            </div>

            {/* Status message toast */}
            {avaMessage && (
              <div className="p-3 bg-[#161618] border border-[#262626] rounded-[8px] text-sm text-[#8a8a8b] flex items-center justify-between">
                <span>{avaMessage}</span>
                <button onClick={() => setAvaMessage(null)} className="text-[#444] hover:text-[#8a8a8b]">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Folder Table */}
            <div className="border border-[#262626] rounded-[10px] bg-[#0c0c0d] overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_80px_120px_130px] px-4 py-2.5 border-b border-[#262626] bg-[#0a0a0b] text-xs uppercase tracking-wider text-[#666]">
                <span>Folder</span>
                <span className="text-center">Videos</span>
                <span className="text-center">Status</span>
                <span className="text-right">Action</span>
              </div>

              {/* Folder Rows */}
              {avaFolders.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#444]">
                  No folders tracked yet. The iMac auto-scans Drive every 10 minutes,
                  or folders will appear here when you trigger processing.
                </div>
              ) : (
                avaFolders.map((folder) => {
                  const isExpanded = avaExpandedId === folder.folderId;
                  const isActioning = avaLoading === folder.folderId;

                  // Stage badge config
                  const stageBadge: Record<string, { label: string; color: string }> = {
                    raw: { label: "🟡 Raw", color: "text-yellow-400" },
                    ready: { label: "🟠 Ready", color: "text-orange-400" },
                    rendering: { label: "🔵 Rendering", color: "text-blue-400" },
                    rendered: { label: "🟢 Rendered", color: "text-emerald-400" },
                    exported: { label: "📋 Exported", color: "text-purple-400" },
                    done: { label: "☑️ Done", color: "text-[#666]" },
                  };
                  const badge = stageBadge[folder.stage] || { label: folder.stage, color: "text-[#8a8a8b]" };

                  // Progress text for rendering
                  let progressText = "";
                  if (folder.stage === "rendering" && folder.progress) {
                    const p = folder.progress;
                    progressText = `${p.done}/${p.total}`;
                  }

                  // Action button config
                  const actionConfig: Record<string, { label: string; emoji: string; action: string } | null> = {
                    raw: null,
                    ready: { label: "Render", emoji: "▶", action: "render" },
                    rendering: null,
                    rendered: { label: "Generate & Export", emoji: "📝", action: "export" },
                    exported: { label: "Mark Done", emoji: "✓", action: "done" },
                    done: null,
                  };
                  const act = actionConfig[folder.stage];

                  return (
                    <div key={folder.folderId} className={`border-b border-[#1a1a1a] last:border-b-0 ${
                      folder.stage === "done" ? "opacity-50" : ""
                    }`}>
                      {/* Main row */}
                      <div
                        className="grid grid-cols-[1fr_80px_120px_130px] px-4 py-3 items-center cursor-pointer hover:bg-[#111] transition-colors"
                        onClick={() => setAvaExpandedId(isExpanded ? null : folder.folderId)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#666] flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[#666] flex-shrink-0" />}
                          <span className="text-sm text-[#e2e2e2] truncate">{folder.path}</span>
                        </div>
                        <span className="text-sm text-[#8a8a8b] text-center">
                          {folder.videoCount}{progressText ? ` (${progressText})` : ""}
                        </span>
                        <span className={`text-xs font-medium text-center ${badge.color}`}>
                          {badge.label}
                        </span>
                        <div className="text-right" onClick={(e) => e.stopPropagation()}>
                          {act && (
                            <button
                              onClick={async () => {
                                setAvaLoading(folder.folderId);
                                try {
                                  const res = await fetch("/api/factory-folders", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: act.action, folderId: folder.folderId }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error);
                                  setAvaMessage(data.message);
                                  // Refresh folder list
                                  const refreshRes = await fetch("/api/factory-folders");
                                  const refreshData = await refreshRes.json();
                                  if (refreshData.folders) setAvaFolders(refreshData.folders);
                                } catch (err: any) {
                                  setAvaMessage(`❌ ${err.message}`);
                                } finally {
                                  setAvaLoading(null);
                                }
                              }}
                              disabled={isActioning}
                              className="px-3 py-1.5 text-xs font-medium rounded-[6px] bg-[#161618] border border-[#262626] text-[#e2e2e2] hover:bg-[#1a1a1c] hover:border-[#444] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                              {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>{act.emoji}</span>}
                              {act.label}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-[#0a0a0b] border-t border-[#1a1a1a]">
                          {folder.ytFolderLink && (
                            <a
                              href={folder.ytFolderLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 mb-3"
                            >
                              <Link className="w-3 h-3" />
                              Open YouTube Drive Folder
                            </a>
                          )}
                          {folder.sheetTabName && (
                            <div className="text-xs text-[#8a8a8b] mb-3">
                              📊 Sheet tab: <span className="text-[#e2e2e2] font-mono">{folder.sheetTabName}</span>
                            </div>
                          )}

                          {folder.videoResults && folder.videoResults.length > 0 ? (
                            <div className="space-y-1">
                              {folder.videoResults.map((v: any, i: number) => (
                                <div key={i} className="grid grid-cols-[24px_1fr_60px_60px] items-center text-xs py-1.5 px-2 rounded bg-[#0c0c0d]">
                                  <span className="text-[#666]">{i + 1}</span>
                                  <span className="text-[#e2e2e2] truncate font-mono text-[11px]">{v.filename}</span>
                                  <span className="text-center">{v.driveFileId ? "✅" : "—"}</span>
                                  <span className="text-center">{v.metadataStatus === "done" ? "✅" : v.metadataStatus === "error" ? "❌" : "—"}</span>
                                </div>
                              ))}
                              <div className="grid grid-cols-[24px_1fr_60px_60px] text-[10px] uppercase tracking-wider text-[#444] mt-1 px-2">
                                <span></span>
                                <span></span>
                                <span className="text-center">Render</span>
                                <span className="text-center">Meta</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-[#444]">
                              {folder.stage === "raw" || folder.stage === "ready"
                                ? "Videos will appear here after rendering starts."
                                : "No video details available."}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* ─── Chapters Mode ─── */
          <div className="space-y-6">
            <div className="flex gap-2 p-1 bg-[#161618] border border-[#262626] rounded-[8px] w-fit">
              <button
                onClick={() => setChapterMode("single")}
                className={`px-4 py-1.5 text-sm font-medium rounded-[6px] transition-colors ${
                  chapterMode === "single"
                    ? "bg-[#262626] text-[#e2e2e2]"
                    : "text-[#8a8a8b] hover:text-[#e2e2e2]"
                }`}
              >
                Single Video
              </button>
              <button
                onClick={() => setChapterMode("batch")}
                className={`px-4 py-1.5 text-sm font-medium rounded-[6px] transition-colors ${
                  chapterMode === "batch"
                    ? "bg-[#262626] text-[#e2e2e2]"
                    : "text-[#8a8a8b] hover:text-[#e2e2e2]"
                }`}
              >
                Drive Folder
              </button>
              <button
                onClick={() => {
                  setChapterMode("multi-id");
                  // Auto-fill tab name: use softwareName if available, else hint placeholder
                  if (!sheetsTabName.trim()) {
                    setSheetsTabName(softwareName.trim() || "");
                  }
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-[6px] transition-colors ${
                  chapterMode === "multi-id"
                    ? "bg-[#262626] text-[#e2e2e2]"
                    : "text-[#8a8a8b] hover:text-[#e2e2e2]"
                }`}
              >
                Batch IDs
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Column - Drive Input */}
            <div className={panelClass}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[#e2e2e2]">
                <Video className="w-4 h-4 text-[#8a8a8b]" />
                Chapter Generator
              </h2>

              <div className="space-y-3">
                {chapterMode === "single" ? (
                  <>
                    <div>
                      <label htmlFor="driveFileId" className={labelClass}>
                        Google Drive File ID
                      </label>
                      <input
                        id="driveFileId"
                        type="text"
                        value={driveFileId}
                        onChange={(e) => setDriveFileId(e.target.value)}
                        placeholder="e.g. 1aBcDeFgHiJkLmNoPqRsT"
                        className={`${inputBase} font-mono`}
                        disabled={isGeneratingChapters || isGeneratingBatch}
                      />
                      <p className="mt-1 text-[11px] uppercase tracking-wider text-[#8a8a8b]">
                        From the Drive URL: drive.google.com/file/d/<strong>THIS_PART</strong>/view
                      </p>
                    </div>

                    <div>
                      <label htmlFor="chapterVideoTitle" className={labelClass}>
                        Video Title (optional)
                      </label>
                      <input
                        id="chapterVideoTitle"
                        type="text"
                        value={chapterVideoTitle}
                        onChange={(e) => setChapterVideoTitle(e.target.value)}
                        placeholder="Helps Gemini generate better chapter names"
                        className={inputBase}
                        disabled={isGeneratingChapters || isGeneratingBatch}
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleGenerateChapters}
                        disabled={isGeneratingChapters || !driveFileId.trim() || isGeneratingBatch}
                        className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2"
                      >
                        {isGeneratingChapters ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing video...
                          </>
                        ) : (
                          <>
                            <Video className="w-4 h-4" />
                            Generate Chapters
                          </>
                        )}
                      </button>
                    </div>
                  </>
                ) : chapterMode === "batch" ? (
                  <>
                    <div>
                      <label htmlFor="driveFolderId" className={labelClass}>
                        Google Drive Folder ID
                      </label>
                      <input
                        id="driveFolderId"
                        type="text"
                        value={driveFolderId}
                        onChange={(e) => setDriveFolderId(e.target.value)}
                        placeholder="e.g. 1aBcDeFgHiJkLmNoPqRsT"
                        className={`${inputBase} font-mono`}
                        disabled={isGeneratingChapters || isGeneratingBatch}
                      />
                      <p className="mt-1 text-[11px] uppercase tracking-wider text-[#8a8a8b]">
                        From the Drive Folder URL: drive.google.com/drive/folders/<strong>THIS_PART</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleAddToQueue}
                        disabled={isAddingToQueue || !driveFolderId.trim() || isGeneratingChapters}
                        className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 border-indigo-500 disabled:opacity-50"
                      >
                        {isAddingToQueue ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Fetching & Queueing...
                          </>
                        ) : (
                          <>
                            <Layers className="w-4 h-4" />
                            Add to Queue
                          </>
                        )}
                      </button>
                    </div>

                    {/* Manual Folders Dashboard */}
                    {manualFolders.length > 0 && (
                      <div className="mt-6 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-[11px] uppercase tracking-wider text-[#8a8a8b] font-medium flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5" />
                            Spot Targeting Queue
                          </h3>
                        </div>
                        {manualFolders.map((folder) => {
                          const isExpanded = expandedManualFolderId === folder.folderId;
                          const videos = folder.videoResults || [];
                          const total = videos.length;
                          const done = videos.filter((v: any) => v.metadataStatus === "done").length;
                          const errors = videos.filter((v: any) => v.metadataStatus === "error").length;
                          const processing = videos.filter((v: any) => v.metadataStatus === "pending").length;
                          
                          let statusLabel = "PENDING";
                          let statusColor = "text-[#8a8a8b] bg-[#262626]";
                          if (folder.stage === "exported" || folder.stage === "done") {
                            statusLabel = "COMPLETE";
                            statusColor = "text-emerald-400 bg-emerald-400/10";
                          } else if (processing > 0 && done > 0) {
                            statusLabel = "PROCESSING";
                            statusColor = "text-blue-400 bg-blue-400/10";
                          } else if (errors > 0 && processing === 0) {
                            statusLabel = "ERRORS";
                            statusColor = "text-red-400 bg-red-400/10";
                          }

                          return (
                            <div key={folder.folderId} className="bg-[#111111] border border-[#262626] rounded-md overflow-hidden">
                              <div 
                                className="p-3 flex items-center justify-between cursor-pointer hover:bg-[#161618] transition-colors"
                                onClick={() => setExpandedManualFolderId(isExpanded ? null : folder.folderId)}
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[#e2e2e2]">{folder.path}</span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusColor}`}>
                                      {statusLabel}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-[#8a8a8b] mt-1">
                                    {done} / {total} Videos Generated
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {(folder.stage === "exported" || folder.stage === "done") && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleForceExportToSheets(folder); }}
                                      className="px-2 py-1 text-[11px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 hover:bg-emerald-400/20 rounded flex items-center gap-1 transition-colors"
                                      title="Force Write to Sheets"
                                    >
                                      <Sheet className="w-3 h-3" /> Sheets
                                    </button>
                                  )}
                                  {(folder.stage === "exported" || folder.stage === "done") && errors > 0 && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRegenerateFailedFolder(folder.folderId, folder.path, folder.sheetTabName); }}
                                      className="px-2 py-1 text-[11px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 rounded flex items-center gap-1 transition-colors"
                                    >
                                      <RefreshCw className="w-3 h-3" /> Retry Failed
                                    </button>
                                  )}
                                  {(folder.stage === "exported" || folder.stage === "done") && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleClearFolder(folder.folderId); }}
                                      className="px-2 py-1 text-[11px] font-medium text-[#8a8a8b] hover:text-[#e2e2e2] flex items-center transition-colors"
                                      title="Clear from Dashboard"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-[#8a8a8b]" /> : <ChevronDown className="w-4 h-4 text-[#8a8a8b]" />}
                                </div>
                              </div>
                              
                              {isExpanded && (
                                <div className="border-t border-[#262626] bg-[#0c0c0d] p-3 max-h-[300px] overflow-y-auto">
                                  <div className="space-y-1">
                                    {videos.map((vid: any) => (
                                      <div key={vid.driveFileId} className="flex items-center justify-between py-1.5 border-b border-[#262626] last:border-0">
                                        <div className="flex items-center gap-2 overflow-hidden flex-1 pr-4">
                                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                            vid.metadataStatus === "done" ? "bg-emerald-500" :
                                            vid.metadataStatus === "error" ? "bg-red-500" : "bg-[#8a8a8b]"
                                          }`} />
                                          <span className="text-xs text-[#e2e2e2] truncate">{vid.filename}</span>
                                        </div>
                                        {vid.metadataStatus === "error" && (
                                          <div className="text-[10px] text-red-400 bg-red-400/10 px-2 py-0.5 rounded truncate max-w-[200px]" title={vid.metadataError}>
                                            {vid.metadataError}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  /* ── Multi-ID Batch Mode ── */
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="multiIdInput" className={labelClass + " mb-0"}>
                          Google Drive File IDs
                        </label>
                        {multiIdInput.trim() && (
                          <button
                            type="button"
                            onClick={() => {
                              setMultiIdInput("");
                              setBatchFiles([]);
                              setBatchComplete(false);
                              setBatchProgress("");
                              setChapters("");
                            }}
                            disabled={isGeneratingBatch}
                            className="text-[11px] uppercase tracking-wider text-red-400 hover:text-red-300 disabled:opacity-50 flex items-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            Clear All
                          </button>
                        )}
                      </div>
                      <textarea
                        id="multiIdInput"
                        value={multiIdInput}
                        onChange={(e) => setMultiIdInput(e.target.value)}
                        placeholder={`Paste up to 20 Google Drive file IDs\nSeparate by comma or new line\n\ne.g.\n1aBcDeFgHiJkLmNoPqRsT\n2xYzAbCdEfGhIjKlMnOp`}
                        rows={7}
                        className={`${inputBase} font-mono resize-none`}
                        disabled={isGeneratingBatch}
                      />
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-wider text-[#8a8a8b]">
                          From: drive.google.com/file/d/<strong>THIS_PART</strong>/view
                        </p>
                        {multiIdInput.trim() && (
                          <span className={`text-[11px] uppercase tracking-wider font-medium ${
                            parseIds(multiIdInput).length >= 20 ? "text-amber-400" : "text-[#8a8a8b]"
                          }`}>
                            {parseIds(multiIdInput).length}/20 IDs
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleGenerateMultiId}
                        disabled={isGeneratingBatch || !multiIdInput.trim() || isGeneratingChapters}
                        className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2 bg-violet-600 hover:bg-violet-500 border-violet-500"
                      >
                        {isGeneratingBatch ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing IDs...
                          </>
                        ) : (
                          <>
                            <Layers className="w-4 h-4" />
                            Process {parseIds(multiIdInput).length > 0 ? `${parseIds(multiIdInput).length} ID${parseIds(multiIdInput).length !== 1 ? "s" : ""}` : "IDs"}
                          </>
                        )}
                      </button>
                      {isGeneratingBatch && (
                        <button
                          onClick={handleStopBatch}
                          className="px-3 py-2 text-sm font-medium rounded-[6px] border border-red-900/50 bg-red-950/20 text-red-400 hover:bg-red-950/40 flex items-center gap-1.5"
                        >
                          <Square className="w-3.5 h-3.5" />
                          Stop
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* Progress Indicators */}
                {isGeneratingChapters && chapterMode === "single" && (
                  <div className="p-3 rounded-[6px] border border-[#262626] bg-[#161618] text-[11px] uppercase tracking-wider text-[#8a8a8b] space-y-1">
                    <p>⏳ Downloading video from Drive...</p>
                    <p>⏳ Uploading to Gemini File API...</p>
                    <p>⏳ Waiting for video processing...</p>
                    <p className="text-[#e2e2e2]">This may take 1–3 minutes for large files.</p>
                  </div>
                )}

                {(isGeneratingBatch || batchFiles.length > 0) && (chapterMode === "batch" || chapterMode === "multi-id") && (
                  <div className="p-3 rounded-[6px] border border-[#262626] bg-[#161618] space-y-3">
                    <div className="text-[11px] uppercase tracking-wider text-[#e2e2e2] flex items-center gap-2 font-semibold">
                      <Layers className="w-3.5 h-3.5 text-[#8a8a8b]" />
                      {batchProgress || "Batch Progress"}
                    </div>
                    <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                      {batchFiles.map((f, i) => (
                        <div key={f.id} className="space-y-0">
                          <div className="flex items-center justify-between p-2 rounded bg-[#0c0c0d] border border-[#262626]">
                            <span className="text-xs text-[#e2e2e2] truncate max-w-[180px]" title={f.name}>
                              {i + 1}. {f.name}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider shrink-0 ml-2">
                              {f.status === "pending" && <span className="text-[#8a8a8b]">Pending</span>}
                              {f.status === "processing" && <span className="text-blue-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Processing</span>}
                              {f.status === "success" && <span className="text-emerald-400 flex items-center gap-1"><Check className="w-3 h-3"/> Done</span>}
                              {f.status === "error" && <span className="text-red-400 flex items-center gap-1"><X className="w-3 h-3"/> Failed</span>}
                            </span>
                          </div>
                          {f.status === "error" && f.error && (
                            <div className="ml-4 px-2 py-1.5 text-[10px] text-red-400/80 bg-red-950/20 border-l-2 border-red-500/30 rounded-br">
                              <span className="font-semibold uppercase tracking-wider">{f.errorCategory || "Error"}</span>: {f.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Batch Summary — appears after completion */}
                    {batchComplete && !isGeneratingBatch && (
                      <div className="pt-2 border-t border-[#262626] space-y-2">
                        <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider">
                          <span className="text-emerald-400">
                            ✓ {batchFiles.filter((f) => f.status === "success").length} succeeded
                          </span>
                          {batchFiles.filter((f) => f.status === "error").length > 0 && (
                            <span className="text-red-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {batchFiles.filter((f) => f.status === "error").length} failed
                            </span>
                          )}
                          {batchFiles.filter((f) => f.status === "pending").length > 0 && (
                            <span className="text-[#8a8a8b]">
                              {batchFiles.filter((f) => f.status === "pending").length} skipped
                            </span>
                          )}
                        </div>
                        {batchFiles.some((f) => f.status === "error") && (
                          <button
                            onClick={handleCopyErrorLog}
                            className="px-3 py-1.5 rounded-[6px] border border-red-900/50 bg-red-950/20 text-xs text-red-400 hover:bg-red-950/40 flex items-center gap-1.5"
                          >
                            <Copy className="w-3 h-3" />
                            Copy Error Log
                          </button>
                        )}
                      </div>
                    )}

                    {/* Sheets Config & Commit — ONLY for multi-id batch mode now */}
                    {batchComplete && !isGeneratingBatch && batchFiles.some((f) => f.status === "success") && chapterMode === "multi-id" && (
                      <div className="pt-3 border-t border-[#262626] space-y-3">
                        <div className="text-[11px] uppercase tracking-wider text-[#e2e2e2] flex items-center gap-2 font-semibold">
                          <Sheet className="w-3.5 h-3.5 text-[#8a8a8b]" />
                          Commit to Google Sheets
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label htmlFor="spreadsheetId" className="text-[10px] uppercase tracking-wider text-[#8a8a8b] block mb-1">
                              Spreadsheet ID
                            </label>
                            <input
                              id="spreadsheetId"
                              type="text"
                              value={spreadsheetId}
                              onChange={(e) => setSpreadsheetId(e.target.value)}
                              placeholder="From URL: docs.google.com/spreadsheets/d/THIS_PART/edit"
                              className={`${inputBase} font-mono text-xs`}
                              disabled={isCommittingToSheets}
                            />
                          </div>
                          <div>
                            <label htmlFor="sheetsTabName" className="text-[10px] uppercase tracking-wider text-[#8a8a8b] block mb-1">
                              Tab Name
                            </label>
                            <input
                              id="sheetsTabName"
                              type="text"
                              value={sheetsTabName}
                              onChange={(e) => setSheetsTabName(e.target.value)}
                              placeholder="e.g. Figma Videos"
                              className={`${inputBase} font-mono text-xs`}
                              disabled={isCommittingToSheets}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={handleCommitToSheets}
                            disabled={isCommittingToSheets || !spreadsheetId.trim() || !sheetsTabName.trim()}
                            className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 border-emerald-500 disabled:opacity-50"
                          >
                            {isCommittingToSheets ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Writing...
                              </>
                            ) : (
                              <>
                                <Sheet className="w-4 h-4" />
                                Commit to Sheets
                              </>
                            )}
                          </button>
                          {sheetsProgress && (
                            <span className="text-[11px] text-[#8a8a8b] uppercase tracking-wider">
                              {sheetsProgress}
                            </span>
                          )}
                        </div>

                        {/* Sheets write status */}
                        {batchFiles.some((f) => f.sheetsStatus && f.sheetsStatus !== "pending") && (
                          <div className="space-y-1">
                            {batchFiles.filter((f) => f.sheetsStatus && f.sheetsStatus !== "pending").map((f) => (
                              <div key={`sheets-${f.id}`} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-[#0c0c0d]">
                                <span className="text-[#e2e2e2] truncate max-w-[160px]">{f.title || f.name}</span>
                                <span className="shrink-0 ml-2 uppercase tracking-wider">
                                  {f.sheetsStatus === "writing" && <span className="text-blue-400 flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin"/> Writing</span>}
                                  {f.sheetsStatus === "written" && <span className="text-emerald-400 flex items-center gap-1"><Check className="w-2.5 h-2.5"/> Written</span>}
                                  {f.sheetsStatus === "error" && <span className="text-red-400 flex items-center gap-1" title={f.sheetsError}><X className="w-2.5 h-2.5"/> Failed</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Chapter Output */}
            <div className={panelClass}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-[#e2e2e2]">
                <FileText className="w-4 h-4 text-[#8a8a8b]" />
                Chapters Output
                {chapterFileName && (
                  <span className="text-[11px] font-normal text-[#8a8a8b] truncate max-w-[200px]">
                    — {chapterFileName}
                  </span>
                )}
              </h2>

              <textarea
                value={chapters}
                onChange={(e) => setChapters(e.target.value)}
                placeholder="Generated chapters will appear here...\n\n[00:00] Introduction\n[00:35] Opening the Dashboard\n[01:12] Creating a New Project"
                rows={16}
                className={`${inputBase} font-mono resize-none`}
                disabled={isGeneratingChapters}
              />

              {chapters && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-[#8a8a8b]">
                    {chapters.trim().split("\n").filter((l) => l.trim()).length} chapters
                  </span>
                  <button
                    onClick={handleCopyChapters}
                    className="px-3 py-1.5 rounded-[6px] border border-[#262626] bg-[#161618] text-xs text-[#e2e2e2] hover:bg-[#1a1a1c] flex items-center gap-1.5"
                  >
                    {chaptersCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy to Clipboard
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#111111] border border-[#262626] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-[#262626] flex items-center justify-between bg-[#161618]">
              <h2 className="text-lg font-semibold text-[#e2e2e2] flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-400" />
                Prompt Version History
              </h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 rounded-lg text-[#8a8a8b] hover:text-[#e2e2e2] hover:bg-[#262626] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <p className="text-sm text-[#8a8a8b] mb-4">
                The last 10 versions of your presets are saved here. Restoring a version will completely overwrite your current presets and rules.
              </p>
              
              {historyData.length === 0 ? (
                <div className="text-center py-8 text-[#8a8a8b] text-sm">
                  No history available yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {historyData.map((v, i) => (
                    <div key={i} className="p-4 border border-[#262626] rounded-lg bg-[#0c0c0d] flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-[#e2e2e2]">
                          Version {historyData.length - i}
                        </div>
                        <div className="text-xs text-[#8a8a8b] mt-1">
                          Saved: {new Date(v.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestoreVersion(i)}
                        disabled={isRestoring}
                        className="px-4 py-2 text-xs font-medium rounded-[6px] border border-[#262626] bg-[#161618] text-[#e2e2e2] hover:bg-[#1a1a1c] disabled:opacity-50 flex items-center gap-2"
                      >
                        {isRestoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
