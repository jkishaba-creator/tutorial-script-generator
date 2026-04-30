# Producer Upload Guide — Standard Operating Procedure

## Your Job

1. Record your tutorial in OBS at **2x speed**
2. Export the screen recording (`.mp4`) and voiceover (`.mp3`)
3. Upload both files to the correct Google Drive folder
4. Drop a **READY** signal when you're done

---

## Folder Structure

Upload to:

```
Uploads Drive > [Your Name] > [Software] > [Today's Date]
```

**Example:**

```
Uploads Drive > Eli > Cursor > 2025-04-30
```

- Your name folder should already exist
- Create the software folder if it doesn't exist (e.g., "Cursor", "Figma", "Canva")
- Create the date folder in `YYYY-MM-DD` format (e.g., `2025-04-30`)

---

## File Naming

| File Type | Rule | Example |
|---|---|---|
| Video | Use the default OBS filename | `tutorial.mp4` |
| Audio | **MUST** have the **exact same base name** as the video | `tutorial.mp3` |

> ⚠️ **If the names don't match, the system cannot pair the video with its audio.**
>
> ✅ `intro-to-ai.mp4` + `intro-to-ai.mp3`
>
> ❌ `intro-to-ai.mp4` + `voiceover.mp3`

If you have multiple tutorials in one session, each pair should have matching names:

```
lesson1-basics.mp4      + lesson1-basics.mp3
lesson2-advanced.mp4    + lesson2-advanced.mp3
```

---

## When You're Done Recording for the Day

1. Make sure **ALL** video + audio files for that date folder are uploaded
2. Wait for uploads to finish (check the progress bar in Google Drive)
3. Create a new file in the date folder called **READY**:
   - Right-click inside the folder → **New** → **Google Docs** → Name it `READY`
   - This tells the system: *"This folder is complete. Process it."*

---

## Rules

| ✅ Do | ❌ Don't |
|---|---|
| Upload ALL files before dropping READY | Don't create the date folder until you're ready to upload |
| Wait for Google Drive upload to finish | Don't drop READY before all files are uploaded |
| Match video + audio filenames exactly | Don't rename or move files after dropping READY |
| Use `YYYY-MM-DD` format for date folders | Don't put files in the wrong producer/software folder |

---

## What If I Need to Fix Something After Dropping READY?

1. **Delete** the `READY` file from the folder
2. Make your changes (upload new files, replace a file, etc.)
3. Create a **new** `READY` file when you're done

The system only processes folders that currently have a READY file. If you delete it, processing stops.

---

## What Happens After You Drop READY?

You don't need to do anything else. The system will:

1. Detect the READY signal automatically
2. Download your videos from Google Drive
3. Process them (sync 2x video → 1x with your voiceover)
4. Upload the finished videos to the YouTube Drive
5. Generate chapters, titles, descriptions, and tags
6. Write everything to the Google Sheet
7. Replace the READY file with a **PROCESSED** file so you know it went through

When you see `PROCESSED` in your folder, your job is done. ✅

---

## FAQ

**Q: What if I forget to drop READY?**
A: The upload manager gets a notification about folders with videos but no READY signal after 48 hours. They'll follow up with you.

**Q: Can I upload to the same date folder on different days?**
A: Only if the folder hasn't been processed yet. Once you see `PROCESSED`, that folder is locked. Create a new date folder for new recordings.

**Q: What video format should I use?**
A: `.mp4` (H.264). This is the default OBS output format. Don't change it.

**Q: What audio format?**
A: `.mp3` exported from your DAW/recording software. Make sure it's the full-length voiceover at normal (1x) speed.
