import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { normalizeCharacterSheet } from "@/lib/character-sheet";

const dataFilePath = path.join(process.cwd(), "data", "character.json");

async function readSheet() {
  const raw = await fs.readFile(dataFilePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const normalized = normalizeCharacterSheet(parsed);

  if (!normalized) {
    throw new Error("Stored character data is invalid.");
  }

  return normalized;
}

export async function GET() {
  try {
    const sheet = await readSheet();
    return NextResponse.json(sheet);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load character.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as unknown;
    const normalized = normalizeCharacterSheet(payload);

    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid character payload." },
        { status: 400 },
      );
    }

    await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
    await fs.writeFile(dataFilePath, JSON.stringify(normalized, null, 2));

    return NextResponse.json(normalized);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save character.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
