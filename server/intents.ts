import type { RealityService } from "./service.ts";
import type { OpenAIEngine } from "./engine.ts";
import { Intent, type IntentT } from "./contracts.ts";
import {
  dayAt,
  addDays,
  localInstant,
  eventStart,
  nextMeetings,
  eligible,
  meetingKind,
} from "./time.ts";
import { now } from "./util.ts";
export class Intents {
  constructor(
    public service: RealityService,
    public ai?: OpenAIEngine,
  ) {}
  async preview(text: string) {
    let intent: IntentT;
    if (this.service.providers.mode === "live") {
      if (!this.ai) throw new Error("OpenAI intent parser is unavailable.");
      intent = await this.ai.intent(text);
    } else {
      const minutes = text.match(/(\d+)\s*min/i);
      intent = Intent.parse({
        kind: /route|drive|navigate|gas|coffee|pharmacy|charging|leave/i.test(
          text,
        )
          ? "trip"
          : /prepare|prep.*block/i.test(text)
            ? "preparation"
            : /message|draft|notify attendees/i.test(text)
              ? "message"
              : "reminder",
        selection: /every|today/i.test(text) ? "today" : "next",
        eventQuery: null,
        clientOnly: /client|customer/i.test(text),
        minutes: minutes ? Number(minutes[1]) : null,
        absoluteTime: null,
        day: /tomorrow/i.test(text)
          ? "tomorrow"
          : /today|afternoon/i.test(text)
            ? "today"
            : "unspecified",
        period: /morning/i.test(text)
          ? "morning"
          : /afternoon/i.test(text)
            ? "afternoon"
            : "unspecified",
        channel: /slack/i.test(text) ? "slack" : null,
        stop: /gas/i.test(text)
          ? "gas"
          : /coffee/i.test(text)
            ? "coffee"
            : /pharmacy/i.test(text)
              ? "pharmacy"
              : /charging/i.test(text)
                ? "ev"
                : null,
        maxAddedMinutes: null,
        needsClarification: null,
      });
    }
    const config = this.service.config();
    let events = this.service.events().filter((e) => eligible(e.event));
    if (intent.clientOnly) events = events.filter((e) => e.clientMeeting);
    if (intent.eventQuery)
      events = events.filter((e) =>
        (e.event.summary || "")
          .toLowerCase()
          .includes(intent.eventQuery!.toLowerCase()),
      );
    const next = nextMeetings(events, config.preferences.timezone);
    const today = dayAt(now(), config.preferences.timezone);
    if (intent.selection === "today")
      events = next.candidates.filter(
        (e) =>
          dayAt(
            eventStart(e.event, config.preferences.timezone),
            config.preferences.timezone,
          ) === today,
      );
    else
      events = next.ambiguous ? next.candidates : next.next ? [next.next] : [];
    const absoluteTime =
      intent.absoluteTime ||
      (intent.period !== "unspecified"
        ? localInstant(
            intent.day === "tomorrow" ? addDays(today, 1) : today,
            `${String(intent.period === "morning" ? config.preferences.morningHour : config.preferences.afternoonHour).padStart(2, "0")}:00`,
            config.preferences.timezone,
          )
        : undefined);
    let virtualWarning: string | undefined;
    if (
      intent.kind === "trip" &&
      intent.selection === "next" &&
      next.next &&
      meetingKind(next.next.event) === "virtual"
    ) {
      virtualWarning =
        "Your next meeting is virtual. Choose the next in-person meeting if you need a route.";
      if (
        next.nextPhysical &&
        !events.some((e) => e.id === next.nextPhysical!.id)
      )
        events.push(next.nextPhysical);
    }
    return {
      intent,
      events: events.map((e) => ({
        id: e.id,
        summary: e.event.summary,
        start: e.event.start,
        location: e.event.location,
        kind: meetingKind(e.event),
        unresolved: e.unresolved,
      })),
      absoluteTime,
      timezone: config.preferences.timezone,
      needsSelection: next.ambiguous || events.length !== 1,
      warning:
        intent.needsClarification ||
        virtualWarning ||
        (!events.length
          ? "No matching event is available. Scan Calendar or choose an event."
          : next.ambiguous
            ? "Unresolved times may change which meeting is next. Select the intended occurrence."
            : null),
    };
  }
}
