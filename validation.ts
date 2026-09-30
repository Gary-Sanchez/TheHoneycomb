import type express from "express";
import { z } from "zod";
import { ACTIVITIES } from "./src/types";

// Request-body schemas for every mutating endpoint in server.ts (US-10). Validation runs before
// any db.ts call, so a malformed payload can never reach lowdb / honeycomb-data.json.
// Keep these in sync with src/types.ts (Attendee, AttendanceRecord).

// "is required" when the field is absent, `expected` when it's present with the wrong type/format.
const fieldError = (expected: string) => (issue: { input?: unknown }) =>
  issue.input === undefined ? "is required" : expected;

const string = () => z.string({ error: fieldError("must be a string") });

const nonEmptyString = string().refine(s => s.trim().length > 0, { error: "must be a non-empty string" });

// Same shape the date inputs and parsers produce: YYYY-MM-DD, and a real calendar date.
const isoDate = z.iso.date({ error: fieldError("must be a date in YYYY-MM-DD format") });

const stringArray = z.array(string(), { error: fieldError("must be an array of strings") });

export const attendeeSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  email: string().optional(),
  enrolledActivities: stringArray,
  joinedDate: isoDate,
});

export const attendanceRecordSchema = z.object({
  id: nonEmptyString,
  attendeeId: nonEmptyString,
  attendeeName: string(),
  activity: string(),
  date: isoDate,
  status: z.enum(["present", "absent"], { error: fieldError('must be "present" or "absent"') }),
});

const recordsArray = z.array(attendanceRecordSchema, { error: fieldError("must be an array of attendance records") });

export const enrollmentBodySchema = z.object({ activities: stringArray });

export const recordsBodySchema = z.object({ records: recordsArray });

export const importBodySchema = z.object({
  attendees: z.array(attendeeSchema, { error: fieldError("must be an array of attendees") }),
  records: recordsArray,
});

// US-20 manual check-in: the record must name a colleague and one of the 4 fixed activities;
// `attendee` is sent only when the colleague is new, and must be the one the record points to.
export const manualCheckInBodySchema = z
  .object({
    attendee: attendeeSchema.optional(),
    record: z.object(
      {
        ...attendanceRecordSchema.shape,
        attendeeName: nonEmptyString,
        activity: z.enum(ACTIVITIES, { error: fieldError(`must be one of: ${ACTIVITIES.join(", ")}`) }),
      },
      { error: fieldError("must be an attendance record object") }
    ),
  })
  .refine(body => !body.attendee || body.attendee.id === body.record.attendeeId, {
    error: "must match record.attendeeId",
    path: ["attendee", "id"],
  });

// An empty string is valid: it clears the note.
export const noteBodySchema = z.object({ text: string() });

// The route overrides the top-level message to keep the pre-US-10 "geminiApiKey is required.";
// the stored key is trimmed, as before.
export const settingsBodySchema = z.object({
  geminiApiKey: z.string({ error: "is required" }).trim().min(1, { error: "is required" }),
});

function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.path.length === 0) return issue.message;
  const field = issue.path.reduce<string>(
    (acc, key) => (typeof key === "number" ? `${acc}[${key}]` : acc ? `${acc}.${String(key)}` : String(key)),
    ""
  );
  return `${field} ${issue.message}`;
}

// Express middleware: on success replaces req.body with the parsed (unknown-keys-stripped) data;
// on failure answers 400 { error, details } without calling the route handler.
// `errorMessage` overrides the top-level message (used by /api/settings to keep its legacy text).
export function validateBody(schema: z.ZodType, errorMessage?: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction): any => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = result.error.issues.map(describeIssue);
      return res.status(400).json({ error: errorMessage ?? `Invalid request body: ${details[0]}`, details });
    }
    req.body = result.data;
    next();
  };
}
