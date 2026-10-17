import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { publishedImageUrls } from "../content/visual-assets";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { storageMode, dataDirectory, BackendError } from "./config";
import { supabaseService } from "./supabase";
import { getStorage } from "./storage";
import { registerMedia } from "./media-inventory";
import type { Actor } from "./types";
import { validateUploads } from "./uploads";
import { rasterWork } from "./raster-work";
export async function storeMedia(
  file: File,
  actor?: Actor,
  options?:
    | { x: number; y: number; width: number; height: number }
    | "photo"
    | "artwork",
) {
  const crop = typeof options === "object" ? options : undefined;
  const purpose = typeof options === "string" ? options : "photo";
  const uploads = await validateUploads([file], false);
  if (uploads.length !== 1 || uploads[0].mime === "application/pdf")
    throw new BackendError("invalid_file", 400);
  return rasterWork(async () => {
    try {
      const oriented = await sharp(uploads[0].bytes, {
        limitInputPixels: 30000000,
        animated: false,
        failOn: "warning",
      })
        .rotate()
        .png()
        .toBuffer({ resolveWithObject: true });
      let pipeline = sharp(oriented.data, { limitInputPixels: 30000000 });
      if (crop) {
        if (
          ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
          crop.x < 0 ||
          crop.y < 0 ||
          crop.width < 0.01 ||
          crop.height < 0.01 ||
          crop.x + crop.width > 1.000001 ||
          crop.y + crop.height > 1.000001
        )
          throw new BackendError("invalid_input", 400);
        const left = Math.floor(crop.x * oriented.info.width),
          top = Math.floor(crop.y * oriented.info.height);
        pipeline = pipeline.extract({
          left,
          top,
          width: Math.max(
            1,
            Math.min(
              oriented.info.width - left,
              Math.floor(crop.width * oriented.info.width),
            ),
          ),
          height: Math.max(
            1,
            Math.min(
              oriented.info.height - top,
              Math.floor(crop.height * oriented.info.height),
            ),
          ),
        });
      }
      pipeline = pipeline
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp(
          purpose === "artwork"
            ? { lossless: true, effort: 4 }
            : { quality: 85 },
        );
      const { data, info } = await pipeline.toBuffer({
        resolveWithObject: true,
      });
      if (!info.width || !info.height || data.length > 5 * 1024 * 1024)
        throw new BackendError("invalid_file", 400);
      const id = randomUUID(),
        name = `${id}.webp`;
      let url: string;
      if (storageMode() === "local") {
        const directory = join(dataDirectory(), "media");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(join(directory, name), data, {
          mode: 0o600,
          flag: "wx",
        });
        url = `/api/media/${name}`;
      } else {
        const client = supabaseService(),
          { error } = await client.storage
            .from("portfolio-private")
            .upload(name, data, { contentType: "image/webp", upsert: false });
        if (error) throw new BackendError("unavailable", 503);
        url = `/api/media/${name}`;
      }
      await registerMedia(
        {
          url,
          name: file.name,
          bytes: data.length,
          width: info.width,
          height: info.height,
          createdAt: new Date().toISOString(),
        },
        actor,
      );
      return { url, width: info.width, height: info.height };
    } catch (error) {
      if (error instanceof BackendError) throw error;
      throw new BackendError("invalid_file", 400);
    }
  });
}
export async function readLocalMedia(name: string) {
  if (
    !/^[a-f0-9-]{36}\.(webp|mp4|webm)$/.test(name) ||
    storageMode() !== "local"
  )
    throw new BackendError("not_found", 404);
  try {
    return await readFile(join(dataDirectory(), "media", name));
  } catch {
    throw new BackendError("not_found", 404);
  }
}

export async function readMedia(name: string) {
  if (!/^[a-f0-9-]{36}\.(webp|mp4|webm)$/.test(name))
    throw new BackendError("not_found", 404);
  if (storageMode() === "local") return readLocalMedia(name);
  const { data, error } = await supabaseService()
    .storage.from("portfolio-private")
    .download(name);
  if (error || !data) throw new BackendError("not_found", 404);
  return Buffer.from(await data.arrayBuffer());
}
export async function readPublishedMedia(name: string) {
  if (!/^[a-f0-9-]{36}\.(webp|mp4|webm)$/.test(name))
    throw new BackendError("not_found", 404);
  // Fail closed on storage errors. Drafts and unpublished projects never grant
  // public byte access; UUID secrecy is not an authorization mechanism.
  const { published } = await getStorage().content(),
    url = `/api/media/${name}`;
  const visible = published && publishedImageUrls(published).includes(url);
  if (!visible) throw new BackendError("not_found", 404);
  return readMedia(name);
}

export async function storeHeroVideo(file: File, actor: Actor) {
  if (file.size > 20 * 1024 * 1024)
    throw new BackendError("file_too_large", 413);
  const bytes = Buffer.from(await file.arrayBuffer()),
    type = await fileTypeFromBuffer(bytes);
  if (
    !type ||
    !["video/mp4", "video/webm"].includes(type.mime) ||
    file.type !== type.mime
  )
    throw new BackendError("invalid_file", 400);
  const name = `${randomUUID()}.${type.mime === "video/mp4" ? "mp4" : "webm"}`,
    url = `/api/media/${name}`;
  if (storageMode() === "local") {
    const directory = join(dataDirectory(), "media");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, name), bytes, { mode: 0o600, flag: "wx" });
  } else {
    const { error } = await supabaseService()
      .storage.from("portfolio-private")
      .upload(name, bytes, { contentType: type.mime, upsert: false });
    if (error) throw new BackendError("unavailable", 503);
  }
  await registerMedia(
    {
      url,
      name: file.name,
      bytes: bytes.length,
      width: 0,
      height: 0,
      createdAt: new Date().toISOString(),
    },
    actor,
  );
  return { url, width: 0, height: 0 };
}
export function mediaResponse(
  bytes: Buffer,
  name: string,
  request: Request,
  privateAccess = false,
) {
  const headers: Record<string, string> = {
    "Content-Type": name.endsWith(".mp4")
      ? "video/mp4"
      : name.endsWith(".webm")
        ? "video/webm"
        : "image/webp",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  if (privateAccess)
    headers["Content-Security-Policy"] = "default-src 'none'; sandbox";
  const range = request.headers.get("range");
  if (!range)
    return new Response(Uint8Array.from(bytes), {
      headers: { ...headers, "Content-Length": String(bytes.length) },
    });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = 0,
    end = bytes.length - 1;
  if (!match || (!match[1] && !match[2]))
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
    });
  if (!match[1]) start = Math.max(0, bytes.length - Number(match[2]));
  else {
    start = Number(match[1]);
    if (match[2]) end = Math.min(end, Number(match[2]));
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    start >= bytes.length
  )
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
    });
  return new Response(Uint8Array.from(bytes.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
