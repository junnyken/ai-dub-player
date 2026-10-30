"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CurrentUserDto, TopNavBar } from "@/components/header/TopNavBar";
import { DubJobLauncher } from "@/components/dub/DubJobLauncher";
import { JobHistoryList } from "@/components/dub/JobHistoryList";

export default function HomePage() {
  const [user, setUser] = useState<CurrentUserDto | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const loadUser = useCallback(async () => {
    setIsLoadingUser(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch {
      // Ignore network error on initial load
    } finally {
      setIsLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <TopNavBar
        user={user}
        isLoadingUser={isLoadingUser}
        onUserUpdated={loadUser}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-space-4 py-space-8">
        <DubJobLauncher
          onJobCreated={() => {
            loadUser();
            setHistoryRefresh((c) => c + 1);
          }}
        />
        <JobHistoryList refreshSignal={historyRefresh} />
      </main>
    </div>
  );
}
