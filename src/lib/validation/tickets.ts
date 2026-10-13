import { z } from "zod";

const id = z.string().regex(/^[a-z0-9]{1,40}$/i, "Invalid id.");
const optionalId = z
  .string()
  .regex(/^[a-z0-9]{0,40}$/i, "Invalid id.")
  .transform((value) => value || null);

const subject = z
  .string()
  .trim()
  .min(3, "Subject must be at least 3 characters.")
  .max(200, "Subject must be 200 characters or fewer.");

// Browsers submit textarea line breaks as CRLF; store plain \n.
const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

const description = z
  .string()
  .transform(normalizeNewlines)
  .pipe(z.string().trim()
  .min(1, "Description is required.")
  .max(10000, "Description must be 10,000 characters or fewer."));

export const createTicketSchema = z.object({
  subject,
  description,
  categoryId: id.describe("category"),
  followUpOfId: optionalId,
});

export const updateTicketSchema = z.object({
  ticketId: id,
  subject,
  description,
  categoryId: id,
  tagIds: z.array(id).max(10, "Use at most 10 tags."),
});

export const replySchema = z.object({
  ticketId: id,
  type: z.enum(["PUBLIC_REPLY", "INTERNAL_NOTE"]),
  body: z
    .string()
    .transform(normalizeNewlines)
    .pipe(
      z
        .string()
        .trim()
        .min(1, "Write a message first.")
        .max(10000, "Message must be 10,000 characters or fewer."),
    ),
});

export const statusSchema = z.object({
  ticketId: id,
  status: z.enum([
    "OPEN",
    "IN_PROGRESS",
    "WAITING_ON_CUSTOMER",
    "RESOLVED",
    "CLOSED",
    "CANCELLED",
  ]),
});

export const prioritySchema = z.object({
  ticketId: id,
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
});

// The assignment select posts "teamId:userId". Either side may be empty.
export const assignSchema = z.object({
  ticketId: id,
  target: z
    .string()
    .regex(/^[a-z0-9]{0,40}:[a-z0-9]{0,40}$/i, "Choose who to assign this to.")
    .transform((value) => {
      const [teamId, assigneeId] = value.split(":");
      return { teamId: teamId || null, assigneeId: assigneeId || null };
    }),
});

export const ticketIdSchema = z.object({ ticketId: id });
