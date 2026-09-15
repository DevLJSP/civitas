-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SelectionMethod" AS ENUM ('ELECTION', 'APPOINTMENT', 'EITHER');

-- CreateEnum
CREATE TYPE "ElectionType" AS ENUM ('MAJORITY', 'APPROVAL', 'RANKED');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'NOMINATIONS', 'CAMPAIGNING', 'ACTIVE', 'COUNTING', 'FINISHED', 'CANCELLED', 'QUORUM_NOT_REACHED');

-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('PENDING', 'PROBATION', 'ACTIVE', 'EXPIRED', 'RESIGNED', 'REMOVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MandateOrigin" AS ENUM ('ELECTION', 'APPOINTMENT', 'SUCCESSION', 'PROMOTION');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProposalType" AS ENUM ('MAJORITY', 'APPROVAL');

-- CreateEnum
CREATE TYPE "ImpeachmentStatus" AS ENUM ('OPEN', 'VOTING', 'PASSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImpeachmentMethod" AS ENUM ('ADMIN', 'COUNCIL', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "SuccessionAction" AS ENUM ('APPOINT_SUCCESSOR', 'OPEN_APPLICATIONS', 'START_ELECTION', 'CREATE_VACANCY');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'FILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'CLAIMED', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "icon" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "leadershipCategoryId" TEXT,
    "applicationsChannelId" TEXT,
    "electionChannelId" TEXT,
    "announcementChannelId" TEXT,
    "auditChannelId" TEXT,
    "managerRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "voterRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "councilRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultMandateDays" INTEGER NOT NULL DEFAULT 90,
    "defaultProbationDays" INTEGER NOT NULL DEFAULT 30,
    "defaultQuorumPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "governanceModel" TEXT NOT NULL DEFAULT 'ADMIN',
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 0,
    "minMembershipDays" INTEGER NOT NULL DEFAULT 0,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildMember" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "activeDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipPosition" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "roleId" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "selectionMethod" "SelectionMethod" NOT NULL DEFAULT 'EITHER',
    "termLengthDays" INTEGER NOT NULL DEFAULT 90,
    "probationDays" INTEGER NOT NULL DEFAULT 0,
    "minAccountAgeDays" INTEGER,
    "minMembershipDays" INTEGER,
    "minActivity" INTEGER,
    "maxHolders" INTEGER NOT NULL DEFAULT 1,
    "reelectionLimit" INTEGER NOT NULL DEFAULT 0,
    "requireElection" BOOLEAN NOT NULL DEFAULT true,
    "allowAppointment" BOOLEAN NOT NULL DEFAULT true,
    "successionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionQuestion" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "placeholder" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipApplication" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "motivation" TEXT,
    "experience" TEXT,
    "activity" TEXT,
    "availability" TEXT,
    "answers" JSONB,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipCandidate" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "positionId" TEXT,
    "electionId" TEXT,
    "applicationId" TEXT,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "manifesto" TEXT,
    "experience" TEXT,
    "imageUrl" TEXT,
    "eligibilityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "positionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ElectionType" NOT NULL DEFAULT 'MAJORITY',
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "quorumPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "eligibleRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "nominationsEndsAt" TIMESTAMP(3),
    "campaignEndsAt" TIMESTAMP(3),
    "messageId" TEXT,
    "channelId" TEXT,
    "createdBy" TEXT NOT NULL,
    "winners" JSONB,
    "turnout" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionCandidate" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "manifesto" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionVote" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "voterId" TEXT,
    "candidateId" TEXT,
    "approvals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rankings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionVoterReceipt" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionVoterReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appointedBy" TEXT NOT NULL,
    "reason" TEXT,
    "mandateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mandate" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MandateStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "MandateOrigin" NOT NULL DEFAULT 'APPOINTMENT',
    "termNumber" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "probationEndsAt" TIMESTAMP(3),
    "probationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "electionId" TEXT,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "fromPositionId" TEXT,
    "toPositionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Demotion" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "fromPositionId" TEXT NOT NULL,
    "toPositionId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "decidedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadershipTeam" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leaderRoleId" TEXT,
    "memberRoleId" TEXT,
    "leaderUserId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadershipTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProposalType" NOT NULL DEFAULT 'MAJORITY',
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "quorumPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "options" TEXT[] DEFAULT ARRAY['YES', 'NO']::TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "messageId" TEXT,
    "channelId" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalVote" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "voterId" TEXT,
    "option" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalVoterReceipt" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalVoterReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Impeachment" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "positionId" TEXT,
    "mandateId" TEXT,
    "reason" TEXT NOT NULL,
    "method" "ImpeachmentMethod" NOT NULL DEFAULT 'ADMIN',
    "status" "ImpeachmentStatus" NOT NULL DEFAULT 'OPEN',
    "openedBy" TEXT NOT NULL,
    "votesYes" INTEGER NOT NULL DEFAULT 0,
    "votesNo" INTEGER NOT NULL DEFAULT 0,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Impeachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpeachmentVote" (
    "id" TEXT NOT NULL,
    "impeachmentId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "choice" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpeachmentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuccessionPlan" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "fallbackAction" "SuccessionAction" NOT NULL DEFAULT 'CREATE_VACANCY',
    "claimDeadlineHours" INTEGER NOT NULL DEFAULT 48,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "VacancyStatus" NOT NULL DEFAULT 'OPEN',
    "successionAction" "SuccessionAction",
    "successorUserId" TEXT,
    "deadlineAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");

-- CreateIndex
CREATE INDEX "GuildMember_guildId_idx" ON "GuildMember"("guildId");

-- CreateIndex
CREATE INDEX "GuildMember_userId_idx" ON "GuildMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildMember_guildId_userId_key" ON "GuildMember"("guildId", "userId");

-- CreateIndex
CREATE INDEX "LeadershipPosition_guildId_idx" ON "LeadershipPosition"("guildId");

-- CreateIndex
CREATE INDEX "LeadershipPosition_guildId_isActive_idx" ON "LeadershipPosition"("guildId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipPosition_guildId_name_key" ON "LeadershipPosition"("guildId", "name");

-- CreateIndex
CREATE INDEX "PositionQuestion_positionId_idx" ON "PositionQuestion"("positionId");

-- CreateIndex
CREATE INDEX "LeadershipApplication_guildId_status_idx" ON "LeadershipApplication"("guildId", "status");

-- CreateIndex
CREATE INDEX "LeadershipApplication_positionId_status_idx" ON "LeadershipApplication"("positionId", "status");

-- CreateIndex
CREATE INDEX "LeadershipApplication_applicantId_idx" ON "LeadershipApplication"("applicantId");

-- CreateIndex
CREATE INDEX "LeadershipCandidate_electionId_idx" ON "LeadershipCandidate"("electionId");

-- CreateIndex
CREATE INDEX "LeadershipCandidate_guildId_idx" ON "LeadershipCandidate"("guildId");

-- CreateIndex
CREATE INDEX "Election_guildId_status_idx" ON "Election"("guildId", "status");

-- CreateIndex
CREATE INDEX "Election_guildId_idx" ON "Election"("guildId");

-- CreateIndex
CREATE INDEX "ElectionCandidate_electionId_idx" ON "ElectionCandidate"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionCandidate_electionId_userId_key" ON "ElectionCandidate"("electionId", "userId");

-- CreateIndex
CREATE INDEX "ElectionVote_electionId_idx" ON "ElectionVote"("electionId");

-- CreateIndex
CREATE INDEX "ElectionVote_guildId_idx" ON "ElectionVote"("guildId");

-- CreateIndex
CREATE INDEX "ElectionVoterReceipt_electionId_idx" ON "ElectionVoterReceipt"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionVoterReceipt_electionId_voterId_key" ON "ElectionVoterReceipt"("electionId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_mandateId_key" ON "Appointment"("mandateId");

-- CreateIndex
CREATE INDEX "Appointment_guildId_idx" ON "Appointment"("guildId");

-- CreateIndex
CREATE INDEX "Mandate_guildId_status_idx" ON "Mandate"("guildId", "status");

-- CreateIndex
CREATE INDEX "Mandate_guildId_userId_idx" ON "Mandate"("guildId", "userId");

-- CreateIndex
CREATE INDEX "Mandate_positionId_status_idx" ON "Mandate"("positionId", "status");

-- CreateIndex
CREATE INDEX "Promotion_guildId_status_idx" ON "Promotion"("guildId", "status");

-- CreateIndex
CREATE INDEX "Demotion_guildId_status_idx" ON "Demotion"("guildId", "status");

-- CreateIndex
CREATE INDEX "LeadershipTeam_guildId_idx" ON "LeadershipTeam"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadershipTeam_guildId_name_key" ON "LeadershipTeam"("guildId", "name");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "Proposal_guildId_status_idx" ON "Proposal"("guildId", "status");

-- CreateIndex
CREATE INDEX "ProposalVote_proposalId_idx" ON "ProposalVote"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalVoterReceipt_proposalId_idx" ON "ProposalVoterReceipt"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalVoterReceipt_proposalId_voterId_key" ON "ProposalVoterReceipt"("proposalId", "voterId");

-- CreateIndex
CREATE INDEX "Impeachment_guildId_status_idx" ON "Impeachment"("guildId", "status");

-- CreateIndex
CREATE INDEX "ImpeachmentVote_impeachmentId_idx" ON "ImpeachmentVote"("impeachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ImpeachmentVote_impeachmentId_voterId_key" ON "ImpeachmentVote"("impeachmentId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "SuccessionPlan_positionId_key" ON "SuccessionPlan"("positionId");

-- CreateIndex
CREATE INDEX "SuccessionPlan_guildId_idx" ON "SuccessionPlan"("guildId");

-- CreateIndex
CREATE INDEX "Vacancy_guildId_status_idx" ON "Vacancy"("guildId", "status");

-- CreateIndex
CREATE INDEX "Vacancy_positionId_idx" ON "Vacancy"("positionId");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_createdAt_idx" ON "AuditLog"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_action_idx" ON "AuditLog"("guildId", "action");

-- CreateIndex
CREATE INDEX "ScheduledTask_status_runAt_idx" ON "ScheduledTask"("status", "runAt");

-- AddForeignKey
ALTER TABLE "GuildConfig" ADD CONSTRAINT "GuildConfig_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildMember" ADD CONSTRAINT "GuildMember_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipPosition" ADD CONSTRAINT "LeadershipPosition_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipPosition" ADD CONSTRAINT "LeadershipPosition_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LeadershipPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionQuestion" ADD CONSTRAINT "PositionQuestion_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "LeadershipPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipApplication" ADD CONSTRAINT "LeadershipApplication_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "LeadershipPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadershipCandidate" ADD CONSTRAINT "LeadershipCandidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionCandidate" ADD CONSTRAINT "ElectionCandidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVote" ADD CONSTRAINT "ElectionVote_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVoterReceipt" ADD CONSTRAINT "ElectionVoterReceipt_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mandate" ADD CONSTRAINT "Mandate_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "LeadershipPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "LeadershipTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalVote" ADD CONSTRAINT "ProposalVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalVoterReceipt" ADD CONSTRAINT "ProposalVoterReceipt_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImpeachmentVote" ADD CONSTRAINT "ImpeachmentVote_impeachmentId_fkey" FOREIGN KEY ("impeachmentId") REFERENCES "Impeachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuccessionPlan" ADD CONSTRAINT "SuccessionPlan_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "LeadershipPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "LeadershipPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
