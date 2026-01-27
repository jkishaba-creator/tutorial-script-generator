import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

/** Split text into chunks at sentence boundaries. Never splits mid-sentence. */
function chunkText(text: string, maxWords = 400): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  // Split on sentence boundaries: . ? ! followed by space, or newlines
  const sentences = cleaned.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sent of sentences) {
    const w = sent.split(/\s+/).filter(Boolean).length;
    if (currentWords + w > maxWords && current.length > 0) {
      chunks.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
    current.push(sent);
    currentWords += w;
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

/** Create a WAV file buffer from raw PCM (16-bit, mono). Gemini TTS returns PCM at 24kHz. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);
  let offset = 0;

  const write = (buf: Buffer) => {
    buf.copy(buffer, offset);
    offset += buf.length;
  };

  // RIFF header
  write(Buffer.from("RIFF", "ascii"));
  buffer.writeUInt32LE(36 + dataSize, offset);
  offset += 4;
  write(Buffer.from("WAVE", "ascii"));
  // fmt subchunk
  write(Buffer.from("fmt ", "ascii"));
  buffer.writeUInt32LE(16, offset);
  offset += 4; // subchunk1size (16 for PCM)
  buffer.writeUInt16LE(1, offset);
  offset += 2; // audio format (1 = PCM)
  buffer.writeUInt16LE(numChannels, offset);
  offset += 2;
  buffer.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buffer.writeUInt32LE(byteRate, offset);
  offset += 4;
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), offset);
  offset += 2; // block align
  buffer.writeUInt16LE(bitsPerSample, offset);
  offset += 2;
  // data subchunk
  write(Buffer.from("data", "ascii"));
  buffer.writeUInt32LE(dataSize, offset);
  offset += 4;
  pcm.copy(buffer, offset);

  return buffer;
}

export async function POST(request: NextRequest) {
  try {
    const { text, provider = "gemini" } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid text field" },
        { status: 400 }
      );
    }

    // Handle ElevenLabs
    if (provider === "elevenlabs") {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "ELEVENLABS_API_KEY is not configured" },
          { status: 500 }
        );
      }

      // Default voice ID - you can change this to any ElevenLabs voice ID
      const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            Accept: "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          body: JSON.stringify({
            text: text,
            model_id: "eleven_flash_v2_5",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error("ElevenLabs API error:", errorData);
        return NextResponse.json(
          {
            error: `ElevenLabs API error: ${response.status} ${response.statusText}`,
          },
          { status: response.status }
        );
      }

      const audioBuffer = await response.arrayBuffer();

      return new NextResponse(audioBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Disposition": 'attachment; filename="audio.mp3"',
        },
      });
    }

    // Handle Gemini TTS
    if (provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "GEMINI_API_KEY is not configured" },
          { status: 500 }
        );
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const chunks = chunkText(text, 400);

      const makeTtsConfig = (): Record<string, unknown> => ({
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Charon" },
          },
        },
      });

      // Try TTS models in order (gemini-2.5-flash-tts often 404s; preview may work)
      const modelsToTry = [
        "gemini-2.5-flash-preview-tts",
        "gemini-2.5-flash-tts",
        "gemini-2.5-flash-lite-preview-tts",
      ];

      let lastError: Error | null = null;

      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const pcmBuffers: Buffer[] = [];

          for (const chunk of chunks) {
            const result = await model.generateContent({
              contents: [{ role: "user", parts: [{ text: chunk }] }],
              generationConfig: makeTtsConfig() as any,
            });
            const response = await result.response;
            const parts = response.candidates?.[0]?.content?.parts || [];
            const audioPart = parts.find((part: any) => part.inlineData);
            if (!audioPart?.inlineData?.data) throw new Error("No audio for chunk");
            pcmBuffers.push(Buffer.from(audioPart.inlineData.data, "base64"));
          }

          const combinedPcm = Buffer.concat(pcmBuffers);
          const wav = pcmToWav(combinedPcm, 24000, 1, 16);
          return new NextResponse(new Uint8Array(wav), {
            headers: {
              "Content-Type": "audio/wav",
              "Content-Disposition": 'attachment; filename="audio.wav"',
            },
          });
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.error(`Gemini TTS ${modelName}:`, lastError.message);
          continue;
        }
      }

      return NextResponse.json(
        {
          error: `Gemini TTS failed. Tried: ${modelsToTry.join(", ")}. Last error: ${lastError?.message ?? "unknown"}.`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Invalid provider. Use 'elevenlabs' or 'gemini'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error generating voice:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate audio. Please check your API key and try again.",
      },
      { status: 500 }
    );
  }
}
