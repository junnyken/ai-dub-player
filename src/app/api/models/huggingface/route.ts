import { NextResponse } from "next/server";
import { huggingFaceHubAdapter } from "@/server/providers/huggingface-hub-adapter";

export async function GET() {
  return NextResponse.json(huggingFaceHubAdapter.getModelCatalog(), {
    status: 200,
  });
}
