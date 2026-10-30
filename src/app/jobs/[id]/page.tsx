"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import { CurrentUserDto, TopNavBar } from "@/components/header/TopNavBar";
import { JobProgressTimeline } from "@/components/dub/JobProgressTimeline";
import { DubPlayer } from "@/components/dub/DubPlayer";
import { StudioQualityAndExportPanel } from "@/components/dub/StudioQualityAndExportPanel";
import { TranscriptEditor } from "@/components/dub/TranscriptEditor";
import { TranslationEditor } from "@/components/dub/TranslationEditor";
import { SpeakerVoicePanel } from "@/components/dub/SpeakerVoicePanel";

export default function JobProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [user, setUser] = useState<CurrentUserDto | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const scrollToSpeakerPanel = () => {
    if (typeof document !== "undefined") {
      document
        .getElementById("speaker-voice-heading")
        ?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <TopNavBar
        user={user}
        isLoadingUser={isLoadingUser}
        onUserUpdated={loadUser}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-space-6 px-space-4 py-space-8">
        <JobProgressTimeline jobId={id} />
        <DubPlayer jobId={id} onOpenVoiceDrawer={scrollToSpeakerPanel} />
        <StudioQualityAndExportPanel jobId={id} />
        <SpeakerVoicePanel jobId={id} />
        <TranslationEditor jobId={id} />
        <TranscriptEditor jobId={id} />
      </main>
    </div>
  );
}
