import { Injectable, NotFoundException } from '@nestjs/common';
import { toNoteDto, type NoteDto } from '@leads/shared';
import type { AuthUser } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertCanDeleteNote,
  noteAddedActivity,
  toActivityCreate,
  validateNoteBody,
} from './crm-rules';
import { requireLead } from './lead-lookup';

export const NOTES_LIST_LIMIT = 200;

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first, capped at the latest 200 notes. */
  async list(leadId: string): Promise<NoteDto[]> {
    await requireLead(this.prisma, leadId);
    const rows = await this.prisma.leadNote.findMany({
      where: { leadId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: NOTES_LIST_LIMIT,
    });
    return rows.map(toNoteDto);
  }

  /** Creates the note and its `note_added` activity atomically. The activity never copies the text. */
  async create(leadId: string, actor: AuthUser, rawBody: string): Promise<NoteDto> {
    const body = validateNoteBody(rawBody);
    await requireLead(this.prisma, leadId);
    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leadNote.create({ data: { leadId, authorId: actor.id, body } });
      await tx.leadActivity.create({
        data: toActivityCreate(leadId, actor.id, noteAddedActivity(created.id)),
      });
      return created;
    });
    return toNoteDto(note);
  }

  /** Author or admin only. A note of another lead counts as unknown. */
  async remove(leadId: string, noteId: string, actor: AuthUser): Promise<void> {
    const note = await this.prisma.leadNote.findFirst({ where: { id: noteId, leadId } });
    if (!note) throw new NotFoundException(`Note ${noteId} not found`);
    assertCanDeleteNote(actor, note);
    await this.prisma.leadNote.delete({ where: { id: noteId } });
  }
}
