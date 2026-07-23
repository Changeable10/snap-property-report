import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Share, SquarePlus, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/snapsure-logo.png.asset.json";

export const Route = createFileRoute("/install")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Install Snapsure" },
      {
        name: "description",
        content: "Install the Snapsure app on your phone or desktop for quick access.",
      },
    ],
  }),
  component: InstallPage,
});

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "detecting" | "android" | "ios" | "other";

function detectPlatform(): Platform {
  const ua = window.navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "other";
}

function InstallPage() {
  const [platform, setPlatform] = useState<Platform>("detecting");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-5 py-12">
      <div className="w-full max-w-sm text-center">
        <img src={logoUrl.url} alt="Snapsure" className="mx-auto h-10 w-auto" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">Install Snapsure</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add Snapsure to your home screen for one-tap access to your inspections.
        </p>

        <div className="mt-8">
          {installed ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm font-medium text-foreground">Snapsure is installed 🎉</p>
                <Button asChild className="mt-4 w-full">
                  <Link to="/">
                    Open Snapsure <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : platform === "android" ? (
            <Card>
              <CardContent className="p-6 text-center">
                {installPrompt ? (
                  <Button onClick={handleInstallClick} className="w-full">
                    Install Snapsure
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Open the browser menu and choose{" "}
                    <span className="font-medium">Install app</span> (or{" "}
                    <span className="font-medium">Add to Home screen</span>) to install Snapsure.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : platform === "ios" ? (
            <Card>
              <CardContent className="p-6 text-left">
                <ol className="space-y-4 text-sm text-foreground">
                  <li className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal/10 text-teal">
                      <Share className="h-4 w-4" />
                    </span>
                    <span>
                      Tap the <span className="font-medium">Share</span> button in Safari's toolbar.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal/10 text-teal">
                      <SquarePlus className="h-4 w-4" />
                    </span>
                    <span>
                      Scroll down and tap <span className="font-medium">Add to Home Screen</span>.
                    </span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          ) : platform === "detecting" ? null : (
            <Button asChild className="w-full">
              <Link to="/">
                Open Snapsure <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
