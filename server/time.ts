import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEvent, EventRevision } from "./contracts.ts";
import { assert } from "./util.ts";
export function localInstant(date: string, time: string, zone: string) {
  const p = Temporal.PlainDateTime.from(`${date}T${time}`);
  return p
    .toZonedDateTime(zone, { disambiguation: "reject" })
    .toInstant()
    .toString();
}
export function dayAt(time: string, zone: string) {
  return Temporal.Instant.from(time)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}
export function addDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function eventStart(event: CalendarEvent, zone = "America/Chicago") {
  return event.start.dateTime
    ? Temporal.Instant.from(event.start.dateTime).toString()
    : localInstant(event.start.date!, "00:00", event.start.timeZone || zone);
}
export function occurrenceKey(calendarId: string, e: CalendarEvent) {
  return `${calendarId}:${e.recurringEventId || e.id}:${e.recurringEventId ? e.originalStartTime?.dateTime || e.originalStartTime?.date || e.id : ""}`;
}
export function moveEvent(event: CalendarEvent, value: string, zone: string) {
  assert(
    !event.recurrence,
    "Select a single occurrence, not a recurring series master.",
  );
  if (event.start.date) {
    Temporal.PlainDate.from(value);
    const days = Temporal.PlainDate.from(event.start.date).until(
      Temporal.PlainDate.from(event.end.date!),
    ).days;
    return { start: { date: value }, end: { date: addDays(value, days) } };
  }
  const start = Temporal.Instant.from(value);
  const duration =
    Temporal.Instant.from(event.end.dateTime!).epochMilliseconds -
    Temporal.Instant.from(event.start.dateTime!).epochMilliseconds;
  assert(duration > 0, "Event duration must be positive.");
  return {
    start: {
      dateTime: start.toString(),
      timeZone: event.start.timeZone || zone,
    },
    end: {
      dateTime: start.add({ milliseconds: duration }).toString(),
      timeZone: event.end.timeZone || zone,
    },
  };
}
export function eligible(e: CalendarEvent) {
  return (
    e.status !== "cancelled" &&
    !e.attendees?.some((a) => a.self && a.responseStatus === "declined")
  );
}
export function meetingKind(e: CalendarEvent) {
  const virtual =
    !!e.hangoutLink ||
    !!e.conferenceData ||
    /https?:\/\/|zoom|teams|virtual|online/i.test(e.location || "");
  const physical =
    !!e.location &&
    !/^(https?:\/\/|zoom|teams|virtual|online)/i.test(e.location);
  return physical
    ? virtual
      ? "hybrid"
      : "physical"
    : virtual
      ? "virtual"
      : "unknown";
}
export function nextMeetings(
  events: EventRevision[],
  zone: string,
  at = Date.now(),
) {
  const sorted = events
    .filter(
      (x) => eligible(x.event) && Date.parse(eventStart(x.event, zone)) >= at,
    )
    .sort(
      (a, b) =>
        Date.parse(eventStart(a.event, zone)) -
        Date.parse(eventStart(b.event, zone)),
    );
  return {
    next: sorted[0],
    nextPhysical: sorted.find((x) =>
      ["physical", "hybrid"].includes(meetingKind(x.event)),
    ),
    candidates: sorted,
    ambiguous: sorted.some(
      (x) =>
        x.unresolved.includes("start") || x.unresolved.includes("launchDate"),
    ),
  };
}
export function reminderOverrides(
  e: CalendarEvent,
  defaults: { method: string; minutes: number }[],
  minutes: number,
) {
  assert(
    Number.isInteger(minutes) && minutes >= 0 && minutes <= 40320,
    "Calendar reminders must be 0–40320 minutes before start.",
  );
  const effective =
    e.reminders?.useDefault !== false ? defaults : e.reminders.overrides || [];
  if (effective.some((r) => r.minutes === minutes && r.method === "popup"))
    return undefined;
  assert(
    effective.length < 5,
    "Calendar permits at most five reminder overrides.",
  );
  return {
    useDefault: false,
    overrides: [...effective, { method: "popup", minutes }],
  };
}
