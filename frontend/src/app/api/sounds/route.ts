import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["kicks", "snares", "hats", "bass", "fx", "melodies"] as const;
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".m4a"]);

type SoundCategory = (typeof CATEGORIES)[number];

interface SoundManifest {
  [key: string]: string[];
}

declare global {
  // eslint-disable-next-line no-var
  var __PHONK_SOUNDS_CACHE__: { loadedAt: number; manifest: SoundManifest } | undefined;
}

async function listCategory(category: SoundCategory): Promise<string[]> {
  const directory = path.join(process.cwd(), "public", "sounds", category);

  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((filename) => AUDIO_EXTENSIONS.has(path.extname(filename).toLowerCase()))
      .sort((a, b) => a.localeCompare(b))
      .map((filename) => `/sounds/${category}/${filename}`);
  } catch {
    return [];
  }
}

async function getManifest(): Promise<SoundManifest> {
  const cached = global.__PHONK_SOUNDS_CACHE__;
  if (cached && Date.now() - cached.loadedAt < 60_000) {
    return cached.manifest;
  }

  const categoryLists = await Promise.all(CATEGORIES.map((category) => listCategory(category)));
  const manifest: SoundManifest = {};

  CATEGORIES.forEach((category, index) => {
    manifest[category] = categoryLists[index];
  });

  global.__PHONK_SOUNDS_CACHE__ = {
    loadedAt: Date.now(),
    manifest,
  };

  return manifest;
}

export async function GET() {
  const manifest = await getManifest();

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
