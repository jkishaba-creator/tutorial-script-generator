import { scanUploadsDrive } from "./lib/drive-crawler";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
  const uploadsDriveId = process.env.UPLOADS_DRIVE_ID;
  if (!uploadsDriveId) {
    console.log("No UPLOADS_DRIVE_ID");
    return;
  }
  console.log("Scanning...", uploadsDriveId);
  const scanned = await scanUploadsDrive(uploadsDriveId);
  console.log("Found:", scanned.length);
  console.log(JSON.stringify(scanned, null, 2));
}

run();
