import { useCallback, useState } from "react";
import { useRouter } from "expo-router";
import { IntroLanding } from "./intro";
import { resolveStartupRoute } from "../lib/startup-route";

export default function IndexScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleContinue = useCallback(() => {
    if (busy) return;

    setBusy(true);
    void (async () => {
      try {
        const nextRoute = await resolveStartupRoute();
        router.replace(nextRoute);
      } catch (error) {
        console.warn("Startup route resolution failed:", error);
        router.replace("/login");
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, router]);

  return <IntroLanding buttonLabel="Onboard" busy={busy} onContinue={handleContinue} />;
}
