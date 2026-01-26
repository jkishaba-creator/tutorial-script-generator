# Video Script Generator

A modern web application that converts HTML instructions into narrated video scripts using AI.

## Features

- **Script Generation**: Uses Google's Gemini AI to transform step-by-step instructions into natural-sounding video scripts
- **Voice Synthesis**: Converts scripts to audio using ElevenLabs Text-to-Speech API
- **Clean UI**: Dark mode interface with two-column layout (inputs on left, preview on right)
- **Real-time Editing**: Edit generated scripts before converting to audio
- **Audio Download**: Download generated audio as MP3 files

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.local.example` to `.env.local`
   - Add your API keys:
     ```
     GEMINI_API_KEY=your_gemini_api_key_here
     ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
     ELEVENLABS_VOICE_ID=your_voice_id_here  # Optional, defaults to Rachel
     ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. Enter a **Video Title**
2. Set the **Target Word Count** (default: 1600)
3. Paste your **Instructions** (HTML or step-by-step guide)
4. Click **Generate Script** to create the script using Gemini AI
5. Review and edit the generated script if needed
6. Click **Generate Audio** to synthesize the voiceover using ElevenLabs
7. Preview the audio and download as MP3

## API Routes

### `/api/generate-script`
- **Method**: POST
- **Body**: `{ title: string, wordCount: number, instructions: string }`
- **Returns**: `{ script: string }`

### `/api/generate-voice`
- **Method**: POST
- **Body**: `{ text: string }`
- **Returns**: Audio file (MP3)

## Technologies

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Lucide React** (Icons)
- **Google Gemini AI** (Script generation)
- **ElevenLabs API** (Text-to-Speech)

## License

MIT
