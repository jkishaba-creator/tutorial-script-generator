import { NextResponse } from "next/server";
import { getDriveClientReadWrite } from "@/lib/drive-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const driveId = process.env.UPLOADS_DRIVE_ID;
    if (!driveId) throw new Error("No UPLOADS_DRIVE_ID");

    const drive = getDriveClientReadWrite();
    const res = await drive.files.list({
      q: `'${driveId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const level1 = res.data.files || [];
    const tree = [];

    for (const f1 of level1) {
      if (f1.mimeType !== "application/vnd.google-apps.folder") continue;
      const t1 = { name: f1.name, children: [] as any[] };
      tree.push(t1);

      const res2 = await drive.files.list({
        q: `'${f1.id}' in parents and trashed = false`,
        fields: "files(id, name, mimeType)",
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      for (const f2 of res2.data.files || []) {
        if (f2.mimeType !== "application/vnd.google-apps.folder") continue;
        const t2 = { name: f2.name, children: [] as any[] };
        t1.children.push(t2);

        const res3 = await drive.files.list({
          q: `'${f2.id}' in parents and trashed = false`,
          fields: "files(id, name, mimeType)",
          pageSize: 100,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        for (const f3 of res3.data.files || []) {
          if (f3.mimeType !== "application/vnd.google-apps.folder") continue;
          const t3 = { name: f3.name, files: [] as any[] };
          t2.children.push(t3);

          const res4 = await drive.files.list({
            q: `'${f3.id}' in parents and trashed = false`,
            fields: "files(id, name, mimeType)",
            pageSize: 100,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });

          for (const f4 of res4.data.files || []) {
            t3.files.push(f4.name);
          }
        }
      }
    }

    return NextResponse.json({ tree });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
