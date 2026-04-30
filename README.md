# Video Script Generator & Conveyor Belt Engine

A modern web application that acts as a "Factory Floor" for video production. It handles both AI script generation from HTML and automated video syncing (Conveyor Belt) using Google Drive and FFmpeg.

## Features

### 1. Conveyor Belt (Night Shift)
- **Automated Crawling**: Scans a specific Google Drive Uploads folder hierarchy (`Producer > Software > Date`).
- **FFmpeg Sync Engine**: Automatically slows 2x speed screen recordings down to 1x and overlays the real-time voiceover audio.
- **Smart Skip & Reprocessing**: Remembers which videos are already processed by checking timestamps. If a newer edit is uploaded, it re-processes it automatically.
- **Deep Cleanup**: 48-hour purge logic that automatically deletes raw files and audio from the Uploads drive once the final render is safely in the YouTube drive.
- **Multi-ID Batching**: Supports processing multiple Drive folder IDs sequentially.

### 2. AI Script Generator
- **Script Generation**: Uses Google's Gemini AI to transform step-by-step instructions into natural-sounding video scripts.
- **Voice Synthesis**: Converts scripts to audio using ElevenLabs or Fish.audio APIs.
- **Sheets Integration**: Auto-commits generated metadata and transcripts directly into Google Sheets.

## Setup & Infrastructure

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **System Requirements:**
   - `ffmpeg` must be installed on your machine (`brew install ffmpeg`)
   - Node.js 18+

3. **Configure Environment Variables (`.env.local`):**
   ```env
   # AI Services
   GEMINI_API_KEY=your_gemini_key
   ELEVENLABS_API_KEY=your_elevenlabs_key
   FISH_AUDIO_API_KEY=your_fish_audio_key
   
   # Google Drive Conveyor Belt
   GOOGLE_SERVICE_ACCOUNT_EMAIL=...
   GOOGLE_PRIVATE_KEY=...
   GOOGLE_DRIVE_UPLOADS_FOLDER_ID=...
   GOOGLE_DRIVE_YOUTUBE_FOLDER_ID=...
   
   # Google Sheets
   GOOGLE_SHEETS_DOCUMENT_ID=...
   ```

## Running the Application

1. **Start the Next.js Dev Server:**
   ```bash
   npm run dev
   ```
   Navigate to [http://localhost:3000](http://localhost:3000) for the UI.

2. **Trigger the Night Shift Conveyor Belt:**
   Run this in a separate terminal to kick off the automated Drive crawler:
   ```bash
   curl -X POST http://localhost:3000/api/process-batch
   ```

## Core API Routes

### Conveyor Belt Endpoints
- **`POST /api/process-batch`**: Kicks off the Drive crawler. Checks the Uploads drive, executes Smart Skip, triggers FFmpeg processing, uploads to the YouTube drive, and runs Deep Cleanup.
- **`GET /api/drive-files-metadata`**: Fetches a pre-flight list of files and sorts them alphabetically (The "Golden Rule").

### Script Generator Endpoints
- **`POST /api/generate-script`**: Takes HTML instructions and returns a Gemini-generated script.
- **`POST /api/generate-voice`**: Synthesizes the script into MP3.
- **`POST /api/write-sheets`**: Appends the final metadata to the Google Sheet.

## Technologies
- **Next.js 14** (App Router)
- **TypeScript & Tailwind CSS**
- **FFmpeg (`fluent-ffmpeg`)** (Video rendering)
- **Googleapis** (Drive & Sheets)
- **p-queue** (Concurrency management)
- **Google Gemini AI & ElevenLabs**
