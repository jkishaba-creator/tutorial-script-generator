import { google } from "googleapis";

/** Parse service account credentials from env. */
export function getServiceAccountCredentials(): Record<string, string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");

  try {
    // Accept either raw JSON or base64-encoded JSON
    const decoded = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON or base64");
  }
}

/** Build a Google Drive client authenticated via service account. */
export function getDriveClient() {
  const credentials = getServiceAccountCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  return google.drive({ version: "v3", auth });
}

/** Build a Google Sheets client authenticated via service account. */
export function getSheetsClient() {
  const credentials = getServiceAccountCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

