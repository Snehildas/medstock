import { NextResponse, type NextRequest } from "next/server";
import { apiErrorSchema, listingImportSchema } from "@medstock/shared-types";
import { z } from "zod";
import { readApiSession } from "@/lib/account";
import { localPreviewAllowed } from "@/lib/preview-mode";
import { sameOriginMutation } from "@/lib/request-origin";

export async function POST(request: NextRequest) {
  if (
    !sameOriginMutation({
      method: request.method,
      origin: request.headers.get("origin"),
      fetchSite: request.headers.get("sec-fetch-site"),
      appOrigin: request.nextUrl.origin,
    })
  ) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "This request was not sent from MedStock." } },
      { status: 403 },
    );
  }
  const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
  if (!z.uuid().safeParse(organizationId).success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Choose a distributor organization before uploading." } },
      { status: 400 },
    );
  }
  if (localPreviewAllowed(process.env)) {
    return NextResponse.json(
      {
        error: {
          code: "preview_read_only",
          message: "Local preview does not upload files or call the API.",
        },
      },
      { status: 403 },
    );
  }
  const session = await readApiSession("/app/imports");
  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: { code: "import_file_rejected", message: "Choose a CSV or XLSX file to preview." } },
      { status: 400 },
    );
  }
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
    return NextResponse.json(
      { error: { code: "import_file_rejected", message: "Only CSV and XLSX files can be previewed." } },
      { status: 400 },
    );
  }
  const outbound = new FormData();
  outbound.append("file", file, file.name);
  let response: Response;
  try {
    response = await fetch(`${session.apiOrigin}/distributor/imports?organizationId=${encodeURIComponent(organizationId)}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${session.accessToken}`,
      },
      body: outbound,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { error: { code: "api_unreachable", message: "MedStock could not reach the API." } },
      { status: 503 },
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    return NextResponse.json(
      error.success ? error.data : { error: { code: "api_error", message: "The file could not be previewed." } },
      { status: response.status },
    );
  }
  const preview = listingImportSchema.safeParse(body);
  if (!preview.success || preview.data.organizationId !== organizationId) {
    return NextResponse.json(
      { error: { code: "invalid_response", message: "The preview response could not be read." } },
      { status: 502 },
    );
  }
  return NextResponse.json({ id: preview.data.id });
}
