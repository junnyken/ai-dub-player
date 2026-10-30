-- CreateTable
CREATE TABLE "Voice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'studio-tts-vi',
    "providerVoiceId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "displayName" TEXT NOT NULL,
    "genderPresentation" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "styleTagsJson" TEXT NOT NULL,
    "previewUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VoiceAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "speakerId" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL DEFAULT 'ai',
    "matchScore" REAL NOT NULL DEFAULT 0.85,
    "matchReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DubJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceAssignment_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceAssignment_voiceId_fkey" FOREIGN KEY ("voiceId") REFERENCES "Voice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoicePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assignmentsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoicePreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Voice_providerVoiceId_key" ON "Voice"("providerVoiceId");

-- CreateIndex
CREATE INDEX "Voice_language_isActive_idx" ON "Voice"("language", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceAssignment_speakerId_key" ON "VoiceAssignment"("speakerId");

-- CreateIndex
CREATE INDEX "VoiceAssignment_jobId_idx" ON "VoiceAssignment"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceAssignment_jobId_speakerId_key" ON "VoiceAssignment"("jobId", "speakerId");

-- CreateIndex
CREATE INDEX "VoicePreset_userId_createdAt_idx" ON "VoicePreset"("userId", "createdAt");
