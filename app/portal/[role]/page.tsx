import { Suspense } from "react";
import { Portal } from "@/components/portal";
export default async function Page({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="loading" role="status">
          Opening your workspace…
        </main>
      }
    >
      <Portal role={(await params).role} />
    </Suspense>
  );
}
