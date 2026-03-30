import { Prisma } from '@prisma/client';

/** Coerce arbitrary objects into Prisma JSON input fields. */
export function asJsonInput(
  value: Record<string, unknown> | undefined | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
