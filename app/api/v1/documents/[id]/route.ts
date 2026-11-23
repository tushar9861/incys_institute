import { downloadDocument } from "@/server/files";
import { AppError } from "@/server/errors";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return await downloadDocument(req, (await params).id);
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "Document could not be retrieved.",
      },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
