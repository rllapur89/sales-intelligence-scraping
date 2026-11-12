import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@leads/db';

export const leadNotFound = (id: string): NotFoundException =>
  new NotFoundException(`Lead ${id} not found`);

/** 404 when the lead does not exist. Works with the Prisma client and with a transaction client. */
export async function requireLead(
  db: Pick<Prisma.TransactionClient, 'lead'>,
  id: string,
): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id }, select: { id: true } });
  if (!lead) throw leadNotFound(id);
}

/** 400 when a user id in a request body does not exist. */
export async function requireUser(
  db: Pick<Prisma.TransactionClient, 'user'>,
  id: string,
): Promise<void> {
  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new BadRequestException(`User ${id} not found`);
}
