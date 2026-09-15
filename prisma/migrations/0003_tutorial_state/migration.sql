-- CreateTable
CREATE TABLE "TutorialState" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "createdPositionId" TEXT,
    "createdElectionId" TEXT,
    "startedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorialState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorialState_guildId_key" ON "TutorialState"("guildId");

-- CreateIndex
CREATE INDEX "TutorialState_guildId_idx" ON "TutorialState"("guildId");
