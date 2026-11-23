import { createHash, timingSafeEqual } from "node:crypto";
export function authorizedWorkerRequest(request: Request) {
  const expected = process.env.WORKER_TOKEN;
  const supplied = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!expected || expected.length < 32 || !supplied || supplied.length > 256)
    return false;
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(supplied).digest(),
  );
}
