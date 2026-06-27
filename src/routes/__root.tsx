import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider, useTheme } from "@/hooks/use-theme";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center bg-card-velvet border-gold rounded-2xl p-10">
        <h1 className="text-7xl font-display text-gold">404</h1>
        <h2 className="mt-4 text-xl">This curtain hides nothing</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for has left the stage.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Back to lobby
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center bg-card-velvet border-gold rounded-2xl p-10">
        <h1 className="text-xl font-display text-gold">The show paused</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm">Home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DIT Meet · Velvet Edition" },
      { name: "description", content: "DITM — elegant video conferencing for the DIT 10th anniversary. Start instant meetings, schedule sessions, and invite guests with a single link." },
      { name: "theme-color", content: "#0a0a2e" },
      { property: "og:title", content: "DIT Meet · Velvet Edition" },
      { property: "og:description", content: "DITM — elegant video conferencing for the DIT 10th anniversary. Start instant meetings, schedule sessions, and invite guests with a single link." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "DIT Meet · Velvet Edition" },
      { name: "twitter:description", content: "DITM — elegant video conferencing for the DIT 10th anniversary. Start instant meetings, schedule sessions, and invite guests with a single link." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/96f6aad6-58c1-4c3e-a1ac-977bca4e585b/id-preview-98a2632a--d103bbe3-d733-44ec-9cea-ebf1db696bbd.lovable.app-1778981879155.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/96f6aad6-58c1-4c3e-a1ac-977bca4e585b/id-preview-98a2632a--d103bbe3-d733-44ec-9cea-ebf1db696bbd.lovable.app-1778981879155.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;900&family=Inter:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <ThemedToaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-right" />;
}
