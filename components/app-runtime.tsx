"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
export function AppRuntime() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline ? (
    <div className="offline-banner" role="status">
      <WifiOff size={17} />
      You’re offline. Reconnect to load or save changes.
    </div>
  ) : null;
}
