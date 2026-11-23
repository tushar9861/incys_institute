import { one } from "@/server/db";
import Link from "next/link";
import QRCode from "qrcode";
import { PrintButton } from "@/components/print-button";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial } = await params;
  const c = await one(
    `SELECT c.*,u.name,courses.title,courses.award_type FROM certificates c JOIN enrolments e ON e.id=c.enrolment_id JOIN users u ON u.id=e.student_id JOIN cohorts h ON h.id=e.cohort_id JOIN course_versions v ON v.id=h.version_id JOIN courses ON courses.id=v.course_id WHERE c.serial=$1`,
    [serial],
  );
  const qr = c
    ? await QRCode.toDataURL(
        `${process.env.APP_ORIGIN}/verify/${encodeURIComponent(c.serial)}`,
      )
    : null;
  return (
    <main className="certificate">
      <Link href="/" className="brand">
        INCYS<span>Institute of Nature Cure & Yogic Science</span>
      </Link>
      <div className="panel">
        <p className="eyebrow">Certificate verification</p>
        {c ? (
          <>
            <h1>
              {c.revoked_at ? "Certificate revoked" : "Verified certificate"}
            </h1>
            <h2>{c.name}</h2>
            <p>{c.title}</p>
            <p>{c.award_type}</p>
            <dl>
              <dt>Serial</dt>
              <dd>{c.serial}</dd>
              <dt>Issued</dt>
              <dd>{new Date(c.issued_at).toLocaleDateString("en-IN")}</dd>
            </dl>
            <p className="muted">
              Verification confirms the institute’s issuance record. It does not
              establish university recognition or professional licensure.
            </p>
            {qr && (
              <img
                src={qr}
                alt="Scan to verify this certificate"
                width={160}
                height={160}
              />
            )}
            <PrintButton />
          </>
        ) : (
          <>
            <h1>Certificate not found</h1>
            <p>Check the serial or contact academic support.</p>
          </>
        )}
      </div>
    </main>
  );
}
