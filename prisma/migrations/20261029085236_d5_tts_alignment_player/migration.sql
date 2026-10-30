-- CreateTable
CREATE TABLE "AudioSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "translationSegmentId" TEXT NOT NULL,
    "speakerId" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "rawDurationMs" INTEGER NOT NULL,
    "playbackRate" REAL NOT NULL DEFAULT 1.0,
    "storageKey" TEXT NOT NULL,
    "audioDataUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "timingStrategy" TEXT,
    "errorCode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudioSegment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DubJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AudioSegment_translationSegmentId_fkey" FOREIGN KEY ("translationSegmentId") REFERENCES "TranslationSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AudioSegment_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AudioSegment_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubtitleTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "format" TEXT NOT NULL DEFAULT 'vtt',
    "storageKey" TEXT NOT NULL,
    "vttContent" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubtitleTrack_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DubJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AudioSegment_translationSegmentId_key" ON "AudioSegment"("translationSegmentId");

-- CreateIndex
CREATE INDEX "AudioSegment_jobId_startMs_idx" ON "AudioSegment"("jobId", "startMs");

-- CreateIndex
CREATE INDEX "AudioSegment_jobId_speakerId_idx" ON "AudioSegment"("jobId", "speakerId");

-- CreateIndex
CREATE UNIQUE INDEX "SubtitleTrack_jobId_kind_key" ON "SubtitleTrack"("jobId", "kind");
