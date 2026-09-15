import { SelectionMethod } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { userError } from '../types/index.js';
import { isDuplicateKeyError } from './guards.js';
import { writeAudit } from './auditService.js';
import { AUDIT_ACTIONS } from '../config/constants.js';

export interface CreatePositionInput {
  guildId: string;
  name: string;
  description?: string;
  roleId?: string;
  seats?: number;
  selectionMethod?: SelectionMethod;
  termLengthDays?: number;
  probationDays?: number;
  parentId?: string;
  createdBy: string;
}

export async function createPosition(input: CreatePositionInput) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw userError('Position name must be 2–80 characters.');
  if (input.seats !== undefined && (input.seats < 1 || input.seats > 50)) throw userError('Seats must be 1–50.');

  if (input.parentId) {
    const parent = await prisma.leadershipPosition.findFirst({
      where: { id: input.parentId, guildId: input.guildId },
    });
    if (!parent) throw userError('Parent position not found in this server.');
  }

  const count = await prisma.leadershipPosition.count({ where: { guildId: input.guildId, isActive: true } });
  if (count >= 100) throw userError('This server has reached the position limit (100).');

  // Friendly duplicate check (case-insensitive). The DB unique index is the
  // final arbiter under concurrency — see catch below.
  const clash = await prisma.leadershipPosition.findFirst({
    where: { guildId: input.guildId, name: { equals: name, mode: 'insensitive' } },
  });
  if (clash) {
    throw userError(
      clash.isActive
        ? `A position named "${clash.name}" already exists in this server.`
        : `A position named "${clash.name}" already exists but is inactive. Use /position list to review it.`,
    );
  }

  let created;
  try {
    created = await prisma.leadershipPosition.create({
      data: {
        guildId: input.guildId,
        name,
        description: input.description?.slice(0, 1000),
        roleId: input.roleId,
        seats: input.seats ?? 1,
        selectionMethod: input.selectionMethod ?? 'EITHER',
        termLengthDays: input.termLengthDays ?? 90,
        probationDays: input.probationDays ?? 0,
        parentId: input.parentId,
        createdBy: input.createdBy,
      },
    });
  } catch (err) {
    // Race: two creates with the same name passed the check simultaneously.
    if (isDuplicateKeyError(err)) {
      throw userError(`A position named "${name}" already exists in this server.`);
    }
    throw err;
  }
  await writeAudit({
    guildId: input.guildId,
    actorId: input.createdBy,
    action: AUDIT_ACTIONS.POSITION_CREATE,
    entityType: 'LeadershipPosition',
    entityId: created.id,
    details: { name },
  });
  return created;
}

export async function listPositions(guildId: string, includeInactive = false) {
  return prisma.leadershipPosition.findMany({
    where: { guildId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: 'asc' },
    take: 100,
  });
}

export async function getPosition(guildId: string, positionId: string) {
  const pos = await prisma.leadershipPosition.findFirst({ where: { id: positionId, guildId } });
  if (!pos) throw userError('This position no longer exists.', 'NOT_FOUND');
  return pos;
}

export async function updatePosition(
  guildId: string,
  positionId: string,
  actorId: string,
  patch: Partial<{ description: string; roleId: string; seats: number; termLengthDays: number; probationDays: number; isActive: boolean }>,
) {
  const existing = await getPosition(guildId, positionId);
  void existing;
  const updated = await prisma.leadershipPosition.update({
    where: { id: positionId },
    data: {
      description: patch.description,
      roleId: patch.roleId,
      seats: patch.seats,
      termLengthDays: patch.termLengthDays,
      probationDays: patch.probationDays,
      isActive: patch.isActive,
    },
  });
  await writeAudit({
    guildId,
    actorId,
    action: AUDIT_ACTIONS.POSITION_UPDATE,
    entityType: 'LeadershipPosition',
    entityId: positionId,
    details: { patch: Object.keys(patch) },
  });
  return updated;
}

export async function deletePosition(guildId: string, positionId: string, actorId: string) {
  await getPosition(guildId, positionId);
  const activeMandates = await prisma.mandate.count({
    where: { positionId, status: { in: ['ACTIVE', 'PROBATION', 'PENDING'] } },
  });
  if (activeMandates > 0) throw userError('Cannot delete a position with active mandates. End them first.');
  const updated = await prisma.leadershipPosition.update({
    where: { id: positionId },
    data: { isActive: false },
  });
  await writeAudit({
    guildId,
    actorId,
    action: AUDIT_ACTIONS.POSITION_DELETE,
    entityType: 'LeadershipPosition',
    entityId: positionId,
  });
  return updated;
}
