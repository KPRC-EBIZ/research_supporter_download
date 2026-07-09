const DOWNLOAD_PREFIX = "/__download__/";
const downloads = new Map();

self.addEventListener("message", async (event) => {
  const data = event.data;

  if (!data || data.type !== "REGISTER_DOWNLOAD") return;

  downloads.set(data.id, {
    blob: data.blob,
    filename: data.filename,
    mimeType: data.mimeType || "application/octet-stream",
  });

  event.source?.postMessage({
    type: "REGISTER_DOWNLOAD_DONE",
    id: data.id,
  });
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (!url.pathname.startsWith(DOWNLOAD_PREFIX)) return;

  const id = url.pathname.slice(DOWNLOAD_PREFIX.length);
  const entry = downloads.get(id);

  if (!entry) {
    event.respondWith(
      new Response("Download file not found.", {
        status: 404,
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
      })
    );
    return;
  }

  downloads.delete(id);

  const encodedFilename = encodeURIComponent(entry.filename);

  event.respondWith(
    new Response(entry.blob, {
      status: 200,
      headers: {
        "Content-Type": entry.mimeType,
        "Content-Disposition": `attachment; filename="${entry.filename}"; filename*=UTF-8''${encodedFilename}`,
        "Content-Length": String(entry.blob.size),
        "Cache-Control": "no-store",
      },
    })
  );
});
