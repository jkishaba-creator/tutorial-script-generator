import { NextRequest, NextResponse } from "next/server";
import { runArchitect, countSteps } from "@/lib/architect";
import type { ArchitectInput } from "@/lib/architect";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      instructions,
      targetWordCount,
      wpm = 150,
      numberOfItems,
      itemLabel = "step",
    } = body as Partial<ArchitectInput> & { [k: string]: unknown };

    if (!title?.trim() || !instructions?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: title and instructions" },
        { status: 400 }
      );
    }

    if (typeof targetWordCount !== "number" || targetWordCount <= 0) {
      return NextResponse.json(
        { error: "targetWordCount must be a positive number" },
        { status: 400 }
      );
    }

    let finalNumberOfItems = numberOfItems;
    if (typeof finalNumberOfItems !== "number" || finalNumberOfItems <= 0) {
      // Auto-compute using accurate logic if the client omitted it
      finalNumberOfItems = countSteps(instructions);
    }

    const input: ArchitectInput = {
      title: title.trim(),
      instructions: instructions.trim(),
      targetWordCount,
      wpm: typeof wpm === "number" && wpm > 0 ? wpm : 150,
      numberOfItems: finalNumberOfItems as number,
      itemLabel: typeof itemLabel === "string" ? itemLabel : "step",
    };

    const dna = await runArchitect(input);

    return NextResponse.json({ dna });
  } catch (error) {
    console.error("Error running Architect:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to run Architect analysis. Please try again.",
      },
      { status: 500 }
    );
  }
}
