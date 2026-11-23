import { uploadDocument } from "@/server/files";
import { AppError } from "@/server/errors";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    return Response.json(await uploadDocument(req), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "Document upload could not be completed.",
      },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
