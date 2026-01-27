import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

      // Use the SDK approach - TTS models may only work with SDK, not REST API
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Try different TTS models in order
      const modelsToTry = [
        "gemini-2.5-flash-tts",
        "gemini-2.5-flash-preview-tts",
        "gemini-2.5-flash-lite-preview-tts"
      ];

      let lastError: Error | null = null;

      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });

          // Generate audio using Gemini TTS SDK (config as any - SDK types lack TTS fields)
          const ttsConfig: Record<string, unknown> = {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Charon" },
              },
            },
          };
          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: text }] }],
            generationConfig: ttsConfig as any,
          });

          const response = await result.response;
          
          // Extract audio data from response
          const parts = response.candidates?.[0]?.content?.parts || [];
          const audioPart = parts.find((part: any) => part.inlineData);
          
          if (audioPart?.inlineData?.data) {
            // Gemini TTS returns raw PCM (LINEAR16) at 24kHz, 1ch, 16-bit — no WAV header.
            // Serving it as "audio/mpeg" causes wrong playback (e.g. ~2hr for 8min script).
            // Wrap PCM in a WAV header and return audio/wav.
            const pcm = Buffer.from(audioPart.inlineData.data, "base64");
            const wav = pcmToWav(pcm, 24000, 1, 16);

            return new NextResponse(new Uint8Array(wav), {
              headers: {
                "Content-Type": "audio/wav",
                "Content-Disposition": 'attachment; filename="audio.wav"',
              },
            });
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`Failed with model ${modelName}:`, lastError.message);
          // Continue to next model
          continue;
        }
      }

      // If all models failed, return error
      return NextResponse.json(
        {
          error: `Gemini TTS failed with all models. Last error: ${lastError?.message || "Unknown error"}. Gemini TTS may not be available in your region or API version.`,
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
