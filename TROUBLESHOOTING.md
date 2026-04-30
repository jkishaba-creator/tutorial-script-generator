# Troubleshooting Guide

## 1. Error 500: Cannot find module './chunks/vendor-chunks/next.js'
**Symptom**: You ran `npm run build` or the dev server was forcefully interrupted, and now hitting the API or UI returns a 500 Error.
**Cause**: The Next.js `.next` build cache is corrupted.
**Solution**:
Kill the server, delete the cache, and restart.
```bash
lsof -i :3000 -t | xargs kill -9
rm -rf .next
npm run dev
```

## 2. Google Drive "Processing" Screen
**Symptom**: After the Conveyor Belt finishes a video, you look in Google Drive and see: *"It's taking longer than expected to process this video file for playback."*
**Cause**: This is **100% normal behavior**. Google Drive transcodes all uploaded videos to various resolutions (360p, 720p) for its web player, which takes 5-15 minutes.
**Impact**: This does **not** affect Gemini or downstream systems. APIs download the raw MP4 bytes instantly. You do not need to wait for Drive to finish processing.

## 3. Conveyor Belt Purge 404 Errors
**Symptom**: The terminal logs say `[drive-crawler] Cleanup failed for skipped file: GaxiosError: File not found`.
**Cause**: The file was already manually deleted, or there was a permission sync delay.
**Solution**: Ignore it. The crawler automatically catches this error and continues running safely. It does not break the pipeline.

## 4. Error -102: Connection Refused
**Symptom**: The Next.js development server isn't running or accessible.
**Solution**:
1. Check if Node is installed (`node --version`).
2. Install dependencies (`npm install`).
3. Start the server (`npm run dev`).

## 5. Port 3000 already in use
**Symptom**: Terminal says `EADDRINUSE: address already in use :::3000`.
**Solution**:
1. Find and kill the process: `lsof -i :3000 -t | xargs kill -9`
2. Start the server again.
