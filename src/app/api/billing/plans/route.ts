import { NextResponse } from "next/server";
import { billingService } from "@/server/services/billing-service";

export async function GET() {
  const catalog = billingService.getCatalog();
  return NextResponse.json(catalog, { status: 200 });
}
