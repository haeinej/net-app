import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";

export default function InviteDeepLink() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();

  useEffect(() => {
    router.replace({
      pathname: "/enter-invite",
      params: { prefill_code: typeof code === "string" ? code.toUpperCase() : "" },
    });
  }, [router, code]);

  return null;
}
