-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "targetLanguage" TEXT NOT NULL DEFAULT 'vi',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "provider" TEXT NOT NULL DEFAULT 'context-llm-adapter',
    "model" TEXT NOT NULL DEFAULT 'gemini-context-vi-1.0',
    "promptVersion" TEXT NOT NULL DEFAULT 'vi-dub-context-v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Translation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DubJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranslationSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "translationId" TEXT NOT NULL,
    "transcriptSegmentId" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "originalTranslatedText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "errorCode" TEXT,
    "editedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranslationSegment_translationId_fkey" FOREIGN KEY ("translationId") REFERENCES "Translation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TranslationSegment_transcriptSegmentId_fkey" FOREIGN KEY ("transcriptSegmentId") REFERENCES "TranscriptSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GlossaryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'term',
    "sourceTerm" TEXT NOT NULL,
    "targetTerm" TEXT NOT NULL,
    "speakerId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GlossaryEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DubJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GlossaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Translation_jobId_key" ON "Translation"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationSegment_transcriptSegmentId_key" ON "TranslationSegment"("transcriptSegmentId");

-- CreateIndex
CREATE INDEX "TranslationSegment_translationId_idx" ON "TranslationSegment"("translationId");

-- CreateIndex
CREATE INDEX "GlossaryEntry_jobId_category_idx" ON "GlossaryEntry"("jobId", "category");
