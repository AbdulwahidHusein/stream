import { AppShell } from "@/components/site/app-shell";
import { Recorder } from "@/components/record/recorder";
import { requirePageUser } from "@/lib/auth/current-user";
import { getCreditUsage } from "@/lib/credits";
import { getDb } from "@/lib/db/client";

export const metadata = {
  title: "Record",
};

export default async function RecordPage() {
  const db = await getDb();
  const user = await requirePageUser(db, "/record");
  const credits = await getCreditUsage(db, user);

  return (
    <AppShell
      user={{
        email: user.email,
        name: user.name,
        imageUrl: user.imageUrl,
        plan: user.plan,
      }}
      creditsLabel={credits.summaryLabel}
      outOfCredits={credits.outOfCredits}
    >
      <Recorder
        plan={user.plan}
        creditsDetail={credits.detailLabel}
        outOfCredits={credits.outOfCredits}
      />
    </AppShell>
  );
}
