import { Portal } from "@/components/portal";
export default async function Page({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  return <Portal role={(await params).role} />;
}
