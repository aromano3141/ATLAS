import type { RealityService } from "./service.ts";
import {
  ReminderInput,
  type Reminder,
  type ReminderInputT,
  type EventRevision,
  type CalendarEvent,
} from "./contracts.ts";
import { eventStart, eligible, reminderOverrides } from "./time.ts";
import { assert, hash, id, now, equal } from "./util.ts";
import { ProviderError } from "./providers.ts";
export class Reminders {
  freshDeparture?: (tripId: string, eventId: string) => Promise<string>;
  constructor(public service: RealityService) {}
  async preview(input: unknown) {
    const parsed = ReminderInput.parse(input);
    const event = this.service.currentEvent(parsed.eventId);
    assert(
      eligible(event.event),
      "Canceled or declined meetings cannot receive new reminders.",
    );
    assert(
      !event.unresolved.length,
      "Resolve the meeting facts before scheduling dependent reminders.",
    );
    assert(
      !(parsed.channel === "calendar" && parsed.rule !== "relative"),
      "Use Slack or the app for absolute and departure reminders. Calendar offsets are event-relative.",
    );
    if (parsed.purpose === "preparation") {
      assert(
        event.issue,
        "Preparation reminders require an explicitly linked Jira issue.",
      );
      assert(
        event.issue.fields?.status?.statusCategory?.key !== "done",
        "The preparation task is already complete.",
      );
    }
    const triggerAt = await this.trigger(parsed, event);
    assert(
      Date.parse(triggerAt) > Date.now(),
      "Choose a future reminder time.",
    );
    if (parsed.channel === "slack")
      assert(
        Date.parse(triggerAt) - Date.now() <= 120 * 86400000,
        "Slack can schedule at most 120 days ahead.",
      );
    const logicalId = hash([
      this.service.config().operatorSlackId || "operator",
      event.occurrenceKey,
      parsed.purpose,
      parsed.channel,
    ]);
    const existing = this.service.store.get<Reminder>("reminder", logicalId);
    if (parsed.channel === "calendar")
      this.calendarSettings(event.event, event.defaults, {
        ...parsed,
        id: logicalId,
        calendarMinutes: existing?.calendarMinutes,
      });
    return {
      ...parsed,
      id: logicalId,
      eventRevision: event.revision,
      triggerAt,
      existing,
      warning:
        Date.parse(triggerAt) >=
        Date.parse(
          eventStart(event.event, this.service.config().preferences.timezone),
        )
          ? "This reminder is at or after the meeting."
          : undefined,
    };
  }
  async trigger(input: ReminderInputT, event: EventRevision) {
    if (input.rule === "absolute") {
      assert(
        input.at &&
          /T.*(?:Z|[+-]\d\d:\d\d)$/.test(input.at) &&
          Number.isFinite(Date.parse(input.at)),
        "Choose an absolute date/time with timezone.",
      );
      return new Date(input.at).toISOString();
    }
    if (input.rule === "departure") {
      assert(
        input.tripId && this.freshDeparture,
        "Choose a calculated trip first.",
      );
      return this.freshDeparture(input.tripId, event.id);
    }
    return new Date(
      Date.parse(
        eventStart(event.event, this.service.config().preferences.timezone),
      ) -
        input.minutes * 60000,
    ).toISOString();
  }
  async approve(
    input: unknown,
    expectedEventRevision?: string,
    expectedTriggerAt?: string,
  ) {
    const p = await this.preview(input);
    if (expectedEventRevision)
      assert(
        p.eventRevision === expectedEventRevision,
        "Reminder preview is stale. Review its new trigger time.",
      );
    if (expectedTriggerAt)
      assert(
        p.triggerAt === expectedTriggerAt,
        "Reminder timing changed after preview. Review the new time.",
      );
    const existing = p.existing;
    assert(
      existing?.state !== "executing",
      "A reminder update is in flight. Wait for its receipt before changing it.",
    );
    if (existing)
      for (const previous of this.service.store
        .all<Reminder>("reminderRevision")
        .filter((v) => v.id === existing.id))
        for (const kind of ["slack-reminder", "calendar-reminder"])
          assert(
            !["sending", "uncertain"].includes(
              this.service.store.effect(hash([kind, previous.revision]))
                ?.state || "",
            ),
            "A previous reminder request is uncertain. Recover the stored job before replacing it.",
          );
    if (
      existing &&
      existing.triggerAt === p.triggerAt &&
      existing.eventRevision === p.eventRevision &&
      !["failed", "canceled", "stale"].includes(existing.state)
    )
      return existing;
    const reminder: Reminder = {
      ...ReminderInput.parse(input),
      id: p.id,
      owner: this.service.config().operatorSlackId || "operator",
      eventRevision: p.eventRevision,
      revision: id(),
      triggerAt: p.triggerAt,
      state: "approved",
      approvedAt: now(),
      providerId: existing?.providerId,
      providerChannel: existing?.providerChannel,
      calendarMinutes: existing?.calendarMinutes,
    };
    this.service.store.transaction(() => {
      this.service.store.put("reminder", reminder.id, reminder);
      this.service.store.immutable(
        "reminderRevision",
        reminder.revision,
        reminder,
      );
      this.service.store.enqueue("reminder", reminder.revision, {
        id: reminder.id,
        revision: reminder.revision,
      });
      this.inbox(reminder, "Reminder approved");
    });
    return reminder;
  }
  inbox(r: Reminder, message: string) {
    this.service.store.put("inbox", `reminder:${r.id}`, {
      id: r.id,
      kind: "reminder",
      eventId: r.eventId,
      message,
      state: r.state,
      triggerAt: r.triggerAt,
      updatedAt: now(),
      error: r.lastError,
    });
  }
  async schedules() {
    let cursor = "";
    const values: any[] = [];
    for (let page = 0; page < 100; page++) {
      const data = await this.service.providers.slack(
        "chat.scheduledMessages.list",
        { limit: 100, ...(cursor ? { cursor } : {}) },
        true,
      );
      values.push(...(data.scheduled_messages || []));
      cursor = data.response_metadata?.next_cursor || "";
      if (!cursor) return values;
    }
    throw new Error("Slack schedule readback incomplete.");
  }
  current(r: Reminder) {
    const current = this.service.store.get<Reminder>("reminder", r.id);
    assert(
      current?.revision === r.revision &&
        !["canceled", "stale"].includes(current.state),
      "Reminder was canceled or superseded.",
    );
  }
  begin(r: Reminder) {
    this.current(r);
    r.state = "executing";
    this.service.store.put("reminder", r.id, r);
  }
  sharedOffset(r: Pick<Reminder, "id" | "eventId">, minutes: number) {
    return this.service.store
      .all<Reminder>("reminder")
      .some(
        (other) =>
          other.id !== r.id &&
          other.eventId === r.eventId &&
          other.channel === "calendar" &&
          other.minutes === minutes &&
          !["canceled", "missed"].includes(other.state),
      );
  }
  transferOffset(r: Reminder) {
    if (r.calendarMinutes === undefined) return;
    const other = this.service.store
      .all<Reminder>("reminder")
      .find(
        (other) =>
          other.id !== r.id &&
          other.eventId === r.eventId &&
          other.channel === "calendar" &&
          other.minutes === r.calendarMinutes &&
          !["canceled", "missed"].includes(other.state),
      );
    if (other) {
      other.calendarMinutes = r.calendarMinutes;
      this.service.store.put("reminder", other.id, other);
    }
  }
  calendarSettings(
    remote: CalendarEvent,
    defaults: { method: string; minutes: number }[],
    r: Pick<Reminder, "id" | "eventId" | "minutes" | "calendarMinutes">,
  ) {
    let base = remote;
    if (
      remote.reminders?.useDefault === false &&
      r.calendarMinutes !== undefined &&
      r.calendarMinutes !== r.minutes &&
      !this.sharedOffset(r, r.calendarMinutes)
    ) {
      base = {
        ...remote,
        reminders: {
          ...remote.reminders,
          overrides: (remote.reminders.overrides || []).filter(
            (o) => !(o.method === "popup" && o.minutes === r.calendarMinutes),
          ),
        },
      };
    }
    return (
      reminderOverrides(base, defaults, r.minutes) ||
      (!equal(base.reminders, remote.reminders) ? base.reminders : undefined)
    );
  }
  pending(r: Reminder) {
    return ["calendar-reminder", "slack-reminder"].some((kind) =>
      ["sending", "uncertain"].includes(
        this.service.store.effect(hash([kind, r.revision]))?.state || "",
      ),
    );
  }
  // Recovery only observes provider state; it never creates or replaces a notification.
  async recover(r: Reminder) {
    const kind =
      r.channel === "calendar" ? "calendar-reminder" : "slack-reminder";
    const effect = this.service.store.effect(hash([kind, r.revision]));
    if (!effect || r.channel === "app") return false;
    if (r.channel === "calendar") {
      const remote = await this.service.providers.calendarGet(
        effect.request.calendarId,
        effect.request.eventId,
      );
      if (!equal(remote.reminders, effect.request.patch.reminders))
        return false;
      effect.observations.push({
        at: now(),
        reminders: remote.reminders,
        recovered: true,
      });
      r.providerId = remote.id;
      r.calendarMinutes = effect.request.ownedMinutes;
    } else {
      const matches = (await this.schedules()).filter(
        (s) =>
          s.channel_id === effect.request.channel &&
          s.post_at === effect.request.post_at &&
          s.text === effect.request.text,
      );
      if (matches.length !== 1) return false;
      r.providerId = matches[0].id;
      r.providerChannel = effect.request.channel;
      effect.reference = matches[0];
      effect.observations.push({
        at: now(),
        recovered: true,
        scheduledMessageId: r.providerId,
      });
    }
    assert(
      this.service.store.get<Reminder>("reminder", r.id)?.revision ===
        r.revision &&
        this.service.store.get<Reminder>("reminder", r.id)?.state !==
          "canceled",
      "Reminder recovery was superseded.",
    );
    effect.state = "verified";
    effect.error = undefined;
    this.service.store.putEffect(effect);
    const event = this.service.currentEvent(r.eventId);
    r.state =
      event.revision === r.eventRevision && !event.unresolved.length
        ? "verified"
        : "stale";
    r.lastError =
      r.state === "stale"
        ? "Provider configuration is verified; the event changed and its dependency needs refresh."
        : undefined;
    this.service.store.put("reminder", r.id, r);
    this.inbox(r, "Reminder configuration recovered by provider reread");
    return true;
  }
  async reconcilePending() {
    for (const r of this.service.store.all<Reminder>("reminder")) {
      if (
        r.channel === "app" ||
        ["canceled", "missed", "delivered"].includes(r.state)
      )
        continue;
      if (!this.pending(r) && !(r.channel === "slack" && r.providerId))
        continue;
      try {
        if (await this.recover(r)) continue;
        r.state = "attention";
        r.lastError =
          "The provider schedule or setting could not be established. No replacement was sent; inspect the destination.";
      } catch (error) {
        r.state = "attention";
        r.lastError = (error as Error).message;
      }
      this.service.store.put("reminder", r.id, r);
      this.inbox(r, "Provider reminder reconciliation needs attention");
    }
  }
  async schedule(reminderId: string, revision: string) {
    const r = this.service.store.get<Reminder>("reminder", reminderId);
    assert(r && r.revision === revision, "Reminder revision superseded.");
    if (this.pending(r) && (await this.recover(r))) return;
    const event = this.service.currentEvent(r.eventId);
    assert(
      event.revision === r.eventRevision && !event.unresolved.length,
      "Event changed after reminder approval.",
    );
    const current = await this.service.providers.calendarGet(
      event.calendarId,
      event.event.id,
    );
    assert(
      hash(current) === hash(event.event),
      "Calendar changed. Scan before scheduling.",
    );
    if (r.rule === "departure") {
      const departure = await this.trigger(r, event);
      assert(
        departure === r.triggerAt,
        "Departure estimate changed. Review the revised reminder.",
      );
    }
    if (Date.parse(r.triggerAt) <= Date.now()) {
      r.state = "missed";
      this.current(r);
      this.service.store.put("reminder", r.id, r);
      this.inbox(r, "Reminder time passed before scheduling");
      return;
    }
    try {
      if (r.channel === "calendar") await this.calendar(r, event);
      else if (r.channel === "slack") await this.slack(r);
      else {
        r.state = "scheduled";
      }
      this.current(r);
      this.service.store.put("reminder", r.id, r);
      this.inbox(
        r,
        r.channel === "calendar"
          ? "Calendar reminder setting verified"
          : "Reminder scheduled",
      );
    } catch (error) {
      const current = this.service.store.get<Reminder>("reminder", r.id);
      if (current?.revision !== r.revision || current.state === "canceled")
        throw error;
      r.state = "attention";
      r.lastError = (error as Error).message;
      this.service.store.put("reminder", r.id, r);
      this.inbox(r, "Reminder needs attention");
      throw error;
    }
  }
  async calendar(r: Reminder, event: EventRevision) {
    const remote = await this.service.providers.calendarGet(
      event.calendarId,
      event.event.id,
    );
    const defaults = await this.service.providers.calendarDefaults(
      event.calendarId,
    );
    const effective =
      remote.reminders?.useDefault !== false
        ? defaults
        : remote.reminders.overrides || [];
    const ownedMinutes =
      r.calendarMinutes === r.minutes ||
      !effective.some((o) => o.method === "popup" && o.minutes === r.minutes)
        ? r.minutes
        : undefined;
    const patch = this.calendarSettings(remote, defaults, r);
    this.current(r);
    const actionId = hash(["calendar-reminder", r.revision]);
    let effect = this.service.store.effect(actionId);
    if (!patch) {
      r.state = "verified";
      r.providerId = remote.id;
      return;
    }
    if (effect?.state === "sending" || effect?.state === "uncertain")
      throw new Error(
        "Calendar reminder outcome remains uncertain; inspect current settings before retrying.",
      );
    effect = {
      id: actionId,
      kind: "calendar-reminder",
      state: "sending",
      request: {
        calendarId: event.calendarId,
        eventId: remote.id,
        patch: { reminders: patch },
        etag: remote.etag,
        ownedMinutes,
      },
      observations: [],
      attempts: 1,
      updatedAt: now(),
    };
    this.service.store.putEffect(effect);
    try {
      this.begin(r);
      await this.service.providers.calendarPatch(
        event.calendarId,
        remote.id,
        { reminders: patch },
        remote.etag,
      );
      const result = await this.service.providers.calendarGet(
        event.calendarId,
        remote.id,
      );
      assert(
        result.reminders?.overrides?.some(
          (o) => o.method === "popup" && o.minutes === r.minutes,
        ),
        "Calendar reminder readback failed.",
      );
      effect.state = "verified";
      effect.observations.push({ at: now(), reminders: result.reminders });
      this.service.store.putEffect(effect);
      if (r.calendarMinutes !== ownedMinutes) this.transferOffset(r);
      r.calendarMinutes = ownedMinutes;
      r.providerId = result.id;
      r.state = "verified";
      // A reminder-only edit also changes the event content revision.
      this.service.store.transaction(() => {
        const next = {
          ...event,
          event: result,
          revision: hash([result, event.unresolved, defaults]),
          verifiedAt: now(),
          defaults,
        };
        this.service.store.put("event", event.id, next);
        r.eventRevision = next.revision;
        this.service.store.enqueue("dependency", next.revision, {
          eventId: event.id,
        });
      });
    } catch (error) {
      effect.state = "uncertain";
      effect.error = (error as Error).message;
      this.service.store.putEffect(effect);
      throw error;
    }
  }
  async cancelSlack(r: Reminder) {
    if (!r.providerId) return;
    const schedules = await this.schedules();
    const old = schedules.find((s) => s.id === r.providerId);
    if (!old) {
      const cancellation = this.service.store.effect(
        hash(["cancel-schedule", r.providerId]),
      );
      if (cancellation && cancellation.reference?.postAt * 1000 > Date.now()) {
        cancellation.state = "verified";
        cancellation.observations.push({
          at: now(),
          absentBeforePostTime: true,
        });
        this.service.store.putEffect(cancellation);
      }
      assert(
        this.service.store.effect(hash(["cancel-schedule", r.providerId]))
          ?.state === "verified",
        "The old Slack schedule is absent; it may already have posted. Inspect the destination before replacement.",
      );
      r.providerId = undefined;
      return;
    }
    assert(
      old.post_at * 1000 - Date.now() > 60000,
      "Inside Slack’s 60-second cancellation cutoff. The old reminder may still arrive; replacement has not been scheduled.",
    );
    const actionId = hash(["cancel-schedule", r.providerId]);
    const effect = {
      id: actionId,
      kind: "slack-cancel",
      state: "sending",
      request: {
        scheduled_message_id: r.providerId,
        channel: r.providerChannel,
      },
      observations: [],
      attempts: 1,
      updatedAt: now(),
      reference: { postAt: old.post_at },
    };
    this.service.store.putEffect(effect);
    await this.service.providers.slack(
      "chat.deleteScheduledMessage",
      effect.request,
    );
    const remaining = await this.schedules();
    assert(
      !remaining.some((s) => s.id === r.providerId),
      "Slack cancellation could not be verified.",
    );
    effect.state = "verified";
    this.service.store.putEffect(effect);
    r.providerId = undefined;
    this.service.store.put("reminder", r.id, r);
  }
  async slack(r: Reminder) {
    const operator = this.service.config().operatorSlackId;
    assert(operator, "Configure the operator Slack user before scheduling.");
    const actionId = hash(["slack-reminder", r.revision]);
    let effect = this.service.store.effect(actionId);
    const channel =
      r.providerChannel ||
      (
        await this.service.providers.slack("conversations.open", {
          users: operator,
        })
      ).channel.id;
    const text = `Reality Sync · ${this.service.currentEvent(r.eventId).event.summary || "Meeting"}\n${r.purpose === "departure" ? "Time to leave. Travel timing is an estimate." : r.purpose === "preparation" ? "Preparation reminder." : "Your meeting is coming up."}\nReference ${r.id.slice(0, 8)} / ${r.revision.slice(0, 8)}`;
    const request = {
      channel,
      post_at: Math.floor(Date.parse(r.triggerAt) / 1000),
      text,
    };
    if (effect) {
      const matches = (await this.schedules()).filter(
        (s) =>
          s.channel_id === channel &&
          s.post_at === request.post_at &&
          s.text === text,
      );
      if (matches.length === 1) {
        r.providerId = matches[0].id;
        r.providerChannel = channel;
        r.state = "verified";
        effect.state = "verified";
        effect.reference = matches[0];
        this.service.store.putEffect(effect);
        return;
      }
      assert(
        effect.state === "prepared",
        "Scheduled message outcome uncertain; no duplicate schedule was created.",
      );
    }
    this.begin(r);
    if (r.providerId) await this.cancelSlack(r);
    effect = {
      id: actionId,
      kind: "slack-reminder",
      state: "sending",
      request,
      observations: [],
      attempts: 1,
      updatedAt: now(),
    };
    this.service.store.putEffect(effect);
    try {
      const result = await this.service.providers.slack(
        "chat.scheduleMessage",
        request,
      );
      r.providerId = result.scheduled_message_id;
      r.providerChannel = channel;
      this.service.store.put("reminder", r.id, r);
      effect.reference = result;
      this.service.store.putEffect(effect);
      const exists = (await this.schedules()).find(
        (s) =>
          s.id === r.providerId &&
          s.post_at === request.post_at &&
          s.text === text,
      );
      assert(exists, "Scheduled reminder presence could not be verified.");
      effect.state = "verified";
      this.service.store.putEffect(effect);
      r.state = "verified";
    } catch (error) {
      effect.state = "uncertain";
      effect.error = (error as Error).message;
      this.service.store.putEffect(effect);
      throw error;
    }
  }
  async cancel(reminderId: string) {
    const r = this.service.store.get<Reminder>("reminder", reminderId);
    assert(r, "Reminder not found.");
    assert(
      r.state !== "executing",
      "A reminder update is in flight. Wait for its receipt before canceling.",
    );
    if (this.pending(r))
      assert(
        await this.recover(r),
        "The previous reminder operation is uncertain; inspect the provider before cancellation.",
      );
    if (r.channel === "slack") await this.cancelSlack(r);
    if (
      r.channel === "calendar" &&
      r.calendarMinutes !== undefined &&
      !this.sharedOffset(r, r.calendarMinutes)
    ) {
      const event = this.service.currentEvent(r.eventId);
      const remote = await this.service.providers.calendarGet(
        event.calendarId,
        event.event.id,
      );
      const overrides = remote.reminders?.overrides || [];
      assert(
        remote.reminders?.useDefault === false,
        "Calendar reminder settings changed; review them manually.",
      );
      const next = overrides.filter(
        (o) => !(o.method === "popup" && o.minutes === r.calendarMinutes),
      );
      const effectId = hash(["cancel-calendar-reminder", r.revision]);
      const previous = this.service.store.effect(effectId);
      if (previous && !equal(overrides, next))
        assert(
          !["sending", "uncertain"].includes(previous.state),
          "Calendar cancellation is uncertain; read current settings before retrying.",
        );
      const effect = {
        id: effectId,
        kind: "calendar-cancel",
        state: "sending",
        request: {
          reminders: { useDefault: false, overrides: next },
          etag: remote.etag,
        },
        observations: [],
        attempts: 1,
        updatedAt: now(),
      };
      this.service.store.putEffect(effect);
      if (!equal(overrides, next)) {
        assert(
          this.service.store.get<Reminder>("reminder", r.id)?.revision ===
            r.revision,
          "Reminder cancellation was superseded.",
        );
        await this.service.providers.calendarPatch(
          event.calendarId,
          remote.id,
          { reminders: effect.request.reminders },
          remote.etag,
        );
      }
      const actual = await this.service.providers.calendarGet(
        event.calendarId,
        remote.id,
      );
      assert(
        equal(actual.reminders?.overrides, next),
        "Calendar cancellation readback failed.",
      );
      effect.state = "verified";
      this.service.store.putEffect(effect);
    }
    this.transferOffset(r);
    r.state = "canceled";
    this.service.store.put("reminder", r.id, r);
    this.inbox(
      r,
      r.channel === "calendar" && r.calendarMinutes === undefined
        ? "App tracking stopped; pre-existing native reminder preserved"
        : "Reminder canceled",
    );
  }
  async maintain(eventId: string) {
    const event = this.service.currentEvent(eventId);
    for (const r of this.service.store
      .all<Reminder>("reminder")
      .filter(
        (r) =>
          r.eventId === eventId &&
          !["canceled", "delivered", "missed"].includes(r.state),
      )) {
      if (this.pending(r)) {
        if (!(await this.recover(r))) {
          r.state = "attention";
          r.lastError =
            "The previous provider operation is uncertain. Recover it before maintaining this reminder.";
          this.service.store.put("reminder", r.id, r);
          this.inbox(r, "Reminder recovery required");
          continue;
        }
      }
      if (
        !eligible(event.event) ||
        (r.purpose === "preparation" &&
          event.issue?.fields?.status?.statusCategory?.key === "done")
      ) {
        try {
          await this.cancel(r.id);
        } catch (error) {
          r.state = "attention";
          r.lastError = (error as Error).message;
          this.service.store.put("reminder", r.id, r);
          this.inbox(r, "Cancellation needs attention");
        }
        continue;
      }
      if (r.eventRevision === event.revision) continue;
      if (event.unresolved.length) {
        r.state = "stale";
        r.lastError =
          "Meeting facts are unresolved. Existing provider notifications may still arrive.";
      } else if (r.rule === "absolute") {
        r.eventRevision = event.revision;
        r.lastError =
          Date.parse(r.triggerAt) >= Date.parse(eventStart(event.event))
            ? "The absolute reminder is at or after the revised meeting."
            : undefined;
      } else if (r.channel === "calendar") {
        r.eventRevision = event.revision;
        r.triggerAt = await this.trigger(r, event);
        const effective =
          event.event.reminders?.useDefault !== false
            ? event.defaults
            : event.event.reminders?.overrides || [];
        r.state = effective.some(
          (o) => o.method === "popup" && o.minutes === r.minutes,
        )
          ? "verified"
          : "attention";
        r.lastError =
          r.state === "attention"
            ? "The effective Calendar reminder setting changed. Review it before restoring."
            : undefined;
      } else if (this.service.config().preferences.maintainRelative) {
        try {
          const triggerAt = await this.trigger(r, event);
          if (Date.parse(triggerAt) <= Date.now()) {
            r.state = "attention";
            r.lastError =
              "Revised reminder is in the past; review the existing provider schedule.";
          } else {
            r.triggerAt = triggerAt;
            r.eventRevision = event.revision;
            r.revision = id();
            r.state = "approved";
            this.service.store.immutable("reminderRevision", r.revision, r);
            this.service.store.enqueue("reminder", r.revision, {
              id: r.id,
              revision: r.revision,
            });
          }
        } catch (error) {
          r.state = "stale";
          r.lastError = (error as Error).message;
        }
      } else {
        r.state = "stale";
        r.lastError =
          "Automatic maintenance is disabled. Review the changed meeting.";
      }
      this.service.store.put("reminder", r.id, r);
      this.inbox(r, "Reminder dependency updated");
    }
  }
  async tick(startup = false) {
    const missed = [];
    for (const r of this.service.store.all<Reminder>("reminder")) {
      if (
        r.channel === "app" &&
        r.state === "scheduled" &&
        Date.parse(r.triggerAt) <= Date.now()
      ) {
        r.state =
          startup || Date.now() - Date.parse(r.triggerAt) > 60000
            ? "missed"
            : "delivered";
        this.service.store.put("reminder", r.id, r);
        if (r.state === "missed") missed.push(r.id);
        else this.inbox(r, "Reminder is due");
      }
    }
    if (missed.length)
      this.service.store.put("inbox", `missed:${hash(missed)}`, {
        id: hash(missed),
        kind: "missed",
        message: `${missed.length} reminders passed while the app was inactive.`,
        at: now(),
        reminderIds: missed,
      });
  }
  async refreshDeparture(tripId: string, triggerAt: string) {
    for (const r of this.service.store
      .all<Reminder>("reminder")
      .filter(
        (r) =>
          r.tripId === tripId &&
          !["canceled", "delivered", "missed"].includes(r.state),
      )) {
      if (!this.service.config().preferences.maintainRelative) continue;
      assert(
        !this.pending(r) && r.state !== "executing",
        "Recover the previous reminder operation before changing departure timing.",
      );
      const event = this.service.currentEvent(r.eventId);
      assert(!event.unresolved.length, "Departure facts are unresolved.");
      if (r.triggerAt === triggerAt && r.eventRevision === event.revision)
        continue;
      assert(
        Date.parse(triggerAt) > Date.now(),
        "Refreshed departure is in the past. Review the trip.",
      );
      r.triggerAt = triggerAt;
      r.eventRevision = event.revision;
      r.revision = id();
      r.state = "approved";
      r.lastError = undefined;
      this.service.store.transaction(() => {
        this.service.store.put("reminder", r.id, r);
        this.service.store.immutable("reminderRevision", r.revision, r);
        this.service.store.enqueue("reminder", r.revision, {
          id: r.id,
          revision: r.revision,
        });
        this.inbox(r, "Departure timing refreshed; schedule update queued");
      });
    }
  }
  async preparation(eventId: string, start: string) {
    const event = this.service.currentEvent(eventId);
    assert(event.issue, "Choose an explicitly linked Jira issue.");
    assert(!event.unresolved.length, "Resolve the meeting first.");
    assert(
      event.issue.fields?.status?.statusCategory?.key !== "done",
      "The linked task is already complete.",
    );
    const end = new Date(
      Date.parse(start) + this.service.config().preferences.prepMinutes * 60000,
    ).toISOString();
    assert(
      Date.parse(start) > Date.now() &&
        Date.parse(end) <=
          Date.parse(
            eventStart(event.event, this.service.config().preferences.timezone),
          ),
      "Choose a future preparation block ending before the meeting.",
    );
    const available = await this.service.providers.freebusy(
      event.calendarId,
      start,
      end,
    );
    return {
      eventId,
      eventRevision: event.revision,
      start,
      end,
      available,
      issueKey: event.issue.key,
      summary: `Prepare: ${event.issue.fields?.summary || event.issue.key}`,
    };
  }
  async approveBlock(eventId: string, start: string, eventRevision: string) {
    const preview = await this.preparation(eventId, start);
    assert(
      preview.available,
      "The calendar is busy during this preparation block.",
    );
    assert(
      preview.eventRevision === eventRevision,
      "Preparation preview is stale.",
    );
    const blockId = hash(["prep", eventId, start]);
    const event = this.service.currentEvent(eventId);
    const request = {
      id: blockId,
      summary: preview.summary,
      description: `Reality Sync preparation for ${preview.issueKey}.`,
      start: {
        dateTime: preview.start,
        timeZone: this.service.config().preferences.timezone,
      },
      end: {
        dateTime: preview.end,
        timeZone: this.service.config().preferences.timezone,
      },
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 0 }],
      },
      extendedProperties: { private: { realitySync: blockId } },
    };
    this.service.store.immutable("block", blockId, {
      id: blockId,
      eventId,
      eventRevision,
      request,
      approvedAt: now(),
    });
    this.service.store.enqueue("block", blockId, { blockId });
    return { blockId };
  }
  async createBlock(blockId: string) {
    const block = this.service.store.get("block", blockId);
    assert(block, "Block approval missing.");
    const event = this.service.currentEvent(block.eventId);
    assert(
      event.revision === block.eventRevision,
      "Preparation event revision changed.",
    );
    const effectId = hash(["block", blockId]);
    let effect = this.service.store.effect(effectId);
    if (effect) {
      try {
        const existing = await this.service.providers.calendarGet(
          event.calendarId,
          blockId,
        );
        assert(
          existing.extendedProperties &&
            equal(existing.start, block.request.start),
          "Existing preparation block differs.",
        );
        effect.state = "verified";
        effect.reference = existing;
        this.service.store.putEffect(effect);
        return;
      } catch (error) {
        if (!(error instanceof ProviderError && error.status === 404))
          throw error;
      }
    }
    assert(
      await this.service.providers.freebusy(
        event.calendarId,
        block.request.start.dateTime,
        block.request.end.dateTime,
      ),
      "Preparation slot is no longer available.",
    );
    effect = {
      id: effectId,
      kind: "prep-block",
      state: "sending",
      request: block.request,
      observations: [],
      attempts: (effect?.attempts || 0) + 1,
      updatedAt: now(),
    };
    this.service.store.putEffect(effect);
    await this.service.providers.createBlock(event.calendarId, block.request);
    const observed = await this.service.providers.calendarGet(
      event.calendarId,
      blockId,
    );
    assert(observed.id === blockId, "Preparation block not found on reread.");
    effect.state = "verified";
    effect.reference = observed;
    this.service.store.putEffect(effect);
    this.service.store.log("preparation_verified", {
      blockId,
      eventId: event.id,
    });
  }
}
