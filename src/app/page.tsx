import { getCurrentUser } from "@/lib/auth";
import { ensureSeedData } from "@/lib/seed";
import { NexusHubClient } from "@/components/NexusHubClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeedData();
  const user = await getCurrentUser({ touchPresence: true });
  return <NexusHubClient initialUser={user} />;
}
