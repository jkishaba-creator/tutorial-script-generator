"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Play, Download, FileText, Mic, Plus, Trash2, Layers, Settings, LayoutList, Target, Check, Lock, X, Video, Copy, AlertTriangle, Square, Sheet } from "lucide-react";

type Mode = "single" | "masterclass" | "chapters";
type ChapterBatchMode = "single" | "batch";
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

  // Batch specific state
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

  const handleGenerateScript = async () => {
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
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          minWordCount: minWordCountSingle,
          maxWordCount: maxWordCountSingle,
          targetWordCount,
          instructions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate script");
      }

      const data = await response.json();
      setScript(data.script);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateMasterclassScript = async () => {
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate script");
      }

      const data = await response.json();
      setScript(data.script);
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

  const handleGenerateBatch = async () => {
    if (!driveFolderId.trim()) {
      setError("Please enter a Google Drive Folder ID");
      return;
    }

    setIsGeneratingBatch(true);
    setError(null);
    setChapters("");
    setBatchProgress("Fetching folder contents...");
    setBatchFiles([]);
    setBatchComplete(false);
    batchAbortRef.current = false;

    try {
      // 1. Fetch sorted list of videos from the folder
      const listResponse = await fetch(`/api/drive-folder?folderId=${encodeURIComponent(driveFolderId.trim())}`);
      if (!listResponse.ok) {
        const errorData = await listResponse.json();
        throw new Error(errorData.error || "Failed to fetch folder contents");
      }

      const listData = await listResponse.json();
      const files: BatchFile[] = (listData.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        status: "pending",
      }));

      if (files.length === 0) {
        throw new Error("No video files found in the specified folder.");
      }

      setBatchFiles(files);
      setDriveFolderName(listData.folderName || "");
      
      // Auto-fill the tab name with Software Name + Folder Name
      const prefix = softwareName.trim() ? `${softwareName.trim()} ` : "";
      setSheetsTabName(`${prefix}${listData.folderName || "Videos"}`);

      let aggregatedChapters = "";

      // 2. Loop through each file sequentially
      for (let i = 0; i < files.length; i++) {
        // Check for abort
        if (batchAbortRef.current) {
          setBatchProgress(`Batch stopped by user at Video ${i} of ${files.length}`);
          break;
        }

        const file = files[i];
        
        // Update status to processing
        setBatchFiles((prev) => 
          prev.map((f, idx) => idx === i ? { ...f, status: "processing" } : f)
        );
        setBatchProgress(`Processing Video ${i + 1} of ${files.length}`);

        try {
          const response = await fetch("/api/generate-chapters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driveFileId: file.id,
              videoTitle: file.name.replace(/\.[^/.]+$/, ""), // strip extension for title
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
          
          // Format and append to aggregated output
          const block = `# ${data.title || file.name}\n${newChapters}\n\n`;
          aggregatedChapters += block;
          setChapters(aggregatedChapters);

          // Mark success with all metadata
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
          // Catch individual video failure and continue loop
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          const errorCategory = err?.errorCategory || "UNKNOWN";
          setBatchFiles((prev) => 
            prev.map((f, idx) => idx === i ? { ...f, status: "error", error: errorMessage, errorCategory } : f)
          );
        }
      }

      if (!batchAbortRef.current) {
        setBatchProgress(`Batch processing complete!`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setBatchProgress("Batch failed.");
    } finally {
      setIsGeneratingBatch(false);
      setBatchComplete(true);
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

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleGenerateScript}
                    disabled={isGeneratingScript || isGeneratingAudio}
                    className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2"
                  >
                    {isGeneratingScript ? (
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
                  <span className="text-[11px] uppercase tracking-wider text-[#8a8a8b] px-2 py-1 rounded-[6px] border border-[#262626] bg-[#161618]">
                    ⌘ + Enter
                  </span>
                </div>
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

              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#262626]">
                <button
                  onClick={handleGenerateMasterclassScript}
                  disabled={isGeneratingScript || isGeneratingAudio}
                  className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2"
                >
                  {isGeneratingScript ? (
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
                <span className="text-[11px] uppercase tracking-wider text-[#8a8a8b] px-2 py-1 rounded-[6px] border border-[#262626] bg-[#161618]">
                  ⌘ + Enter
                </span>
              </div>
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
                Drive Folder (Batch)
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
                ) : (
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
                        onClick={handleGenerateBatch}
                        disabled={isGeneratingBatch || !driveFolderId.trim() || isGeneratingChapters}
                        className="ink-btn-primary px-4 py-2 text-sm font-medium flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 border-indigo-500"
                      >
                        {isGeneratingBatch ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Batch Running...
                          </>
                        ) : (
                          <>
                            <Layers className="w-4 h-4" />
                            Process Entire Folder
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

                {(isGeneratingBatch || batchFiles.length > 0) && chapterMode === "batch" && (
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

                    {/* Sheets Config & Commit — appears after batch completes */}
                    {batchComplete && !isGeneratingBatch && batchFiles.some((f) => f.status === "success") && (
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
                              placeholder="e.g. Gemini Windows App Videos"
                              className={`${inputBase} text-xs`}
                              disabled={isCommittingToSheets}
                            />
                          </div>
                        </div>

                        <button
                          onClick={handleCommitToSheets}
                          disabled={isCommittingToSheets || !spreadsheetId.trim() || !sheetsTabName.trim()}
                          className="w-full px-4 py-2.5 text-sm font-medium rounded-[6px] bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {isCommittingToSheets ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {sheetsProgress}
                            </>
                          ) : (
                            <>
                              <Sheet className="w-4 h-4" />
                              Commit Batch to Sheets ({batchFiles.filter((f) => f.status === "success").length} videos)
                            </>
                          )}
                        </button>

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
    </main>
  );
}
