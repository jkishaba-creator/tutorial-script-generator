"use client";

import { useState } from "react";
import { Loader2, Play, Download, FileText, Mic } from "lucide-react";

export default function Home() {
  const [title, setTitle] = useState("");
  const [minWordCount, setMinWordCount] = useState(1500);
  const [maxWordCount, setMaxWordCount] = useState(1700);
  const [targetWordCount, setTargetWordCount] = useState(1600);
  const [instructions, setInstructions] = useState("");
  const [script, setScript] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFormat, setAudioFormat] = useState<"mp3" | "wav">("mp3");
  const [voiceProvider, setVoiceProvider] = useState<"elevenlabs" | "gemini">("elevenlabs");
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const response = await fetch("/api/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          minWordCount,
          maxWordCount,
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

    // Find sentence endings (periods, question marks, exclamation marks)
    // and insert a line break and single ellipsis after them
    // First, normalize multiple spaces/newlines to single spaces
    let formatted = script.replace(/\s+/g, ' ');
    
    // Then add ellipsis after sentence endings
    formatted = formatted.replace(/([.!?])\s/g, '$1\n...\n');
    
    // Clean up any duplicate ellipsis lines that might have been created
    formatted = formatted.replace(/\n\.\.\.\n\.\.\.\n/g, '\n...\n');
    
    setScript(formatted.trim());
  };

  return (
    <main className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">
          Video Script Generator
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Inputs */}
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Input Details
              </h2>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="title"
                    className="block text-sm font-medium mb-2"
                  >
                    Video Title
                  </label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter video title"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
                    disabled={isGeneratingScript || isGeneratingAudio}
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="minWordCount"
                      className="block text-sm font-medium mb-2"
                    >
                      Minimum Word Count
                    </label>
                    <input
                      id="minWordCount"
                      type="number"
                      value={minWordCount}
                      onChange={(e) => setMinWordCount(Number(e.target.value))}
                      min="100"
                      max="10000"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                      disabled={isGeneratingScript || isGeneratingAudio}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="maxWordCount"
                      className="block text-sm font-medium mb-2"
                    >
                      Maximum Word Count
                    </label>
                    <input
                      id="maxWordCount"
                      type="number"
                      value={maxWordCount}
                      onChange={(e) => setMaxWordCount(Number(e.target.value))}
                      min="100"
                      max="10000"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                      disabled={isGeneratingScript || isGeneratingAudio}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="targetWordCount"
                      className="block text-sm font-medium mb-2"
                    >
                      Target Word Count
                    </label>
                    <input
                      id="targetWordCount"
                      type="number"
                      value={targetWordCount}
                      onChange={(e) => setTargetWordCount(Number(e.target.value))}
                      min="100"
                      max="10000"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                      disabled={isGeneratingScript || isGeneratingAudio}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="instructions"
                    className="block text-sm font-medium mb-2"
                  >
                    Instructions
                  </label>
                  <textarea
                    id="instructions"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Enter your HTML instructions or step-by-step guide here..."
                    rows={12}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400 font-mono text-sm resize-none"
                    disabled={isGeneratingScript || isGeneratingAudio}
                  />
                </div>

                <button
                  onClick={handleGenerateScript}
                  disabled={isGeneratingScript || isGeneratingAudio}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isGeneratingScript ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Writing script...
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Generate Script
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Script & Audio */}
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Generated Script
              </h2>

              <button
                onClick={handleFormatForGeminiTTS}
                disabled={!script.trim() || isGeneratingScript || isGeneratingAudio}
                className="w-full mb-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4" />
                Format for Gemini TTS
              </button>

              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Generated script will appear here..."
                rows={16}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400 resize-none"
                disabled={isGeneratingScript || isGeneratingAudio}
              />

              {script && (
                <div className="mt-2 text-sm text-gray-400">
                  Word count: {script.trim().split(/\s+/).filter(word => word.length > 0).length} words
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="voiceProvider"
                    className="block text-sm font-medium mb-2"
                  >
                    Voice Provider
                  </label>
                  <select
                    id="voiceProvider"
                    value={voiceProvider}
                    onChange={(e) => setVoiceProvider(e.target.value as "elevenlabs" | "gemini")}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                    disabled={isGeneratingAudio || isGeneratingScript}
                  >
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="gemini">Gemini TTS</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerateAudio}
                  disabled={!script.trim() || isGeneratingAudio || isGeneratingScript}
                  className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isGeneratingAudio ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Synthesizing audio...
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" />
                      Generate Audio
                    </>
                  )}
                </button>

                {audioUrl && (
                  <div className="space-y-3">
                    <div className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Play className="w-5 h-5 text-green-400" />
                        <span className="font-medium">Audio Preview</span>
                      </div>
                      <audio
                        controls
                        src={audioUrl}
                        className="w-full"
                      >
                        Your browser does not support the audio element.
                      </audio>
                    </div>

                    <button
                      onClick={handleDownloadAudio}
                      className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Download {audioFormat.toUpperCase()}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
