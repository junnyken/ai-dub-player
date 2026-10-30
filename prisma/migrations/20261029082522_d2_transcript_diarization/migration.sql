-- CreateTable
CREATE TABLE "Speaker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "externalSpeakerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "estimatedAgeGroup" TEXT,
    "apparentGender" TEXT,
    "roleHint" TEXT,
    "emotionProfile" TEXT,
    "appearanceCount" INTEGER NOT NULL DEFAULT 0,
    "isEstimated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Speaker_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DubJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "source" TEXT NOT NULL DEFAULT 'asr',
    "provider" TEXT NOT NULL DEFAULT 'acoustic-asr',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transcript_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DubJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transcriptId" TEXT NOT NULL,
    "speakerId" TEXT NOT NULL,
    "segmentIndex" INTEGER NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "sourceText" TEXT NOT NULL,
    "originalSourceText" TEXT NOT NULL,
    "originalSpeakerId" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranscriptSegment_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TranscriptSegment_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "Speaker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranscriptSegmentRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "segmentId" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "editedByUserId" TEXT NOT NULL,
    "previousText" TEXT NOT NULL,
    "newText" TEXT NOT NULL,
    "previousSpeakerId" TEXT NOT NULL,
    "newSpeakerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TranscriptSegmentRevision_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TranscriptSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TranscriptSegmentRevision_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Speaker_jobId_idx" ON "Speaker"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Speaker_jobId_externalSpeakerId_key" ON "Speaker"("jobId", "externalSpeakerId");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_jobId_key" ON "Transcript"("jobId");

-- CreateIndex
CREATE INDEX "TranscriptSegment_transcriptId_segmentIndex_idx" ON "TranscriptSegment"("transcriptId", "segmentIndex");

-- CreateIndex
CREATE INDEX "TranscriptSegment_speakerId_idx" ON "TranscriptSegment"("speakerId");

-- CreateIndex
CREATE INDEX "TranscriptSegmentRevision_segmentId_createdAt_idx" ON "TranscriptSegmentRevision"("segmentId", "createdAt");
