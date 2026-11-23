export function allowedOrigin(origin: string | null) {
  if (!origin) return false;
  return [
    process.env.APP_ORIGIN,
    ...(process.env.ALLOWED_ORIGINS || "").split(","),
  ].some((value) => value?.trim() === origin);
}
