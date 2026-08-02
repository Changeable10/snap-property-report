import { useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

// Installed (home-screen) PWAs on Android are often just resumed from the
// recent-apps stack rather than relaunched, so the page never re-navigates
// and never picks up a new deploy on its own. Re-checking for a new service
// worker whenever the app regains focus/visibility catches that case; the
// toast lets the user pull the new version in on their own terms instead of
// silently reloading mid-task.
export function PwaUpdatePrompt() {
  const shownRef = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      window.addEventListener("focus", check);
      setInterval(check, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!needRefresh || shownRef.current) return;
    shownRef.current = true;
    toast("A new version of Snapsure is available", {
      duration: Infinity,
      action: {
        label: "Reload",
        onClick: () => updateServiceWorker(true),
      },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
