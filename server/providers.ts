import type {
  CalendarEvent,
  ConfigT,
  EntityT,
  EvidenceT,
  Snapshot,
} from "./contracts.ts";
import { assert, hash, now } from "./util.ts";

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
    public code: string,
    public uncertain = false,
    public retryAfter = 0,
  ) {
    super(
      `${provider}: ${code}${retryAfter ? ` (retry after ${retryAfter}s)` : ""}`,
    );
  }
}
export interface Providers {
  mode: "live" | "fixture";
  snapshot(entity: EntityT): Promise<Snapshot>;
  calendarGet(calendarId: string, eventId: string): Promise<CalendarEvent>;
  calendarPatch(
    calendarId: string,
    eventId: string,
    patch: Record<string, unknown>,
    etag: string,
  ): Promise<CalendarEvent>;
  calendarList(
    calendarId: string,
    from: string,
    to: string,
  ): Promise<CalendarEvent[]>;
  calendarDefaults(
    calendarId: string,
  ): Promise<{ method: string; minutes: number }[]>;
  freebusy(calendarId: string, start: string, end: string): Promise<boolean>;
  createBlock(
    calendarId: string,
    event: Record<string, unknown>,
  ): Promise<CalendarEvent>;
  jiraGet(versionId: string): Promise<Record<string, unknown>>;
  jiraPatch(
    versionId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  issue(key: string): Promise<Record<string, any>>;
  slack(
    method: string,
    params?: Record<string, unknown>,
    read?: boolean,
  ): Promise<any>;
  comments(key: string): Promise<any[]>;
  comment(
    key: string,
    text: string,
    actionId: string,
    visibility?: unknown,
  ): Promise<any>;
  health(): Promise<Record<string, unknown>[]>;
}
export class LiveProviders implements Providers {
  mode = "live" as const;
  private googleToken?: { value: string; until: number };
  constructor(public config: () => ConfigT) {}
  async request(
    provider: string,
    url: string,
    init: RequestInit = {},
    read = true,
  ): Promise<any> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      throw new ProviderError(provider, 0, "network_or_timeout", !read);
    }
    if (!response.ok)
      throw new ProviderError(
        provider,
        response.status,
        `HTTP_${response.status}`,
        !read && response.status >= 500,
        Number(response.headers.get("retry-after") || 0),
      );
    if (response.status === 204) return {};
    return response.json();
  }
  async google() {
    if (this.googleToken && this.googleToken.until > Date.now())
      return this.googleToken.value;
    assert(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REFRESH_TOKEN,
      "Configure Google OAuth credentials locally.",
    );
    const data = await this.request(
      "google",
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
          grant_type: "refresh_token",
        }).toString(),
      },
    );
    this.googleToken = {
      value: data.access_token,
      until: Date.now() + (data.expires_in - 90) * 1000,
    };
    return data.access_token;
  }
  allowCalendar(calendarId: string) {
    assert(
      this.config().calendarIds.includes(calendarId) ||
        this.config().entities.some((e) => e.calendarId === calendarId),
      "Calendar is outside the allowlist.",
    );
  }
  async cal(path: string, init: RequestInit = {}, read = true) {
    return this.request(
      "calendar",
      "https://www.googleapis.com/calendar/v3" + path,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${await this.google()}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      },
      read,
    );
  }
  async calendarGet(c: string, e: string) {
    this.allowCalendar(c);
    return this.cal(
      `/calendars/${encodeURIComponent(c)}/events/${encodeURIComponent(e)}`,
    );
  }
  async calendarPatch(
    c: string,
    e: string,
    patch: Record<string, unknown>,
    etag: string,
  ) {
    this.allowCalendar(c);
    assert(
      this.config().entities.some(
        (x) => x.calendarId === c && x.eventId === e,
      ) || Object.keys(patch).every((k) => k === "reminders"),
      "Event repair is outside the allowlist.",
    );
    assert(
      Object.keys(patch).every((k) =>
        ["start", "end", "location", "reminders"].includes(k),
      ),
      "Unsupported Calendar patch.",
    );
    return this.cal(
      `/calendars/${encodeURIComponent(c)}/events/${encodeURIComponent(e)}?sendUpdates=none`,
      {
        method: "PATCH",
        headers: { "If-Match": etag },
        body: JSON.stringify(patch),
      },
      false,
    );
  }
  async calendarList(c: string, from: string, to: string) {
    this.allowCalendar(c);
    let token = "";
    const events: CalendarEvent[] = [];
    for (let page = 0; page < 100; page++) {
      const q = new URLSearchParams({
        singleEvents: "true",
        showDeleted: "true",
        timeMin: from,
        timeMax: to,
        maxResults: "2500",
        ...(token ? { pageToken: token } : {}),
      });
      const data = await this.cal(
        `/calendars/${encodeURIComponent(c)}/events?${q}`,
      );
      events.push(...(data.items || []));
      if (!data.nextPageToken) return events;
      token = data.nextPageToken;
    }
    throw new Error("Calendar pagination incomplete; narrow the date range.");
  }
  async calendarDefaults(c: string) {
    this.allowCalendar(c);
    return (
      (await this.cal(`/users/me/calendarList/${encodeURIComponent(c)}`))
        .defaultReminders || []
    );
  }
  async freebusy(c: string, start: string, end: string) {
    this.allowCalendar(c);
    const data = await this.cal("/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: start,
        timeMax: end,
        items: [{ id: c }],
      }),
    });
    const result = data.calendars?.[c];
    assert(
      result && !result.errors,
      "Calendar availability could not be established.",
    );
    return result.busy.length === 0;
  }
  async createBlock(c: string, event: Record<string, unknown>) {
    this.allowCalendar(c);
    assert(!event.attendees, "Preparation blocks must be personal.");
    return this.cal(
      `/calendars/${encodeURIComponent(c)}/events?sendUpdates=none`,
      { method: "POST", body: JSON.stringify(event) },
      false,
    );
  }
  async jira(path: string, init: RequestInit = {}, read = true) {
    const config = this.config();
    assert(
      /^https:\/\/[a-zA-Z0-9-]+\.atlassian\.net\/?$/.test(config.jiraBaseUrl) &&
        config.jiraEmail &&
        process.env.JIRA_API_TOKEN,
      "Configure Jira tenant, email, and token locally.",
    );
    return this.request(
      "jira",
      config.jiraBaseUrl.replace(/\/$/, "") + "/rest/api/3" + path,
      {
        ...init,
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${config.jiraEmail}:${process.env.JIRA_API_TOKEN}`,
            ).toString("base64"),
          "Content-Type": "application/json",
          ...init.headers,
        },
      },
      read,
    );
  }
  allowVersion(id: string) {
    assert(
      this.config().entities.some((e) => e.jiraVersionId === id),
      "Jira version is outside the allowlist.",
    );
  }
  allowIssue(key: string) {
    assert(
      this.config().entities.some((e) => e.issueKey === key),
      "Jira issue is outside the allowlist.",
    );
  }
  async jiraGet(id: string) {
    this.allowVersion(id);
    return this.jira("/version/" + encodeURIComponent(id));
  }
  async jiraPatch(id: string, patch: Record<string, unknown>) {
    this.allowVersion(id);
    assert(
      Object.keys(patch).length === 1 && typeof patch.releaseDate === "string",
      "Only releaseDate can be repaired.",
    );
    return this.jira(
      "/version/" + encodeURIComponent(id),
      { method: "PUT", body: JSON.stringify(patch) },
      false,
    );
  }
  async issue(key: string) {
    this.allowIssue(key);
    const field = this.config().jiraDatetimeField;
    const data = await this.jira(
      `/issue/${encodeURIComponent(key)}?fields=summary,status,description,duedate,updated,${field || "issuetype"}`,
    );
    return { ...data, comments: await this.comments(key) };
  }
  async comments(key: string) {
    this.allowIssue(key);
    const comments: any[] = [];
    for (let start = 0; start < 10000;) {
      const data = await this.jira(
        `/issue/${encodeURIComponent(key)}/comment?maxResults=100&startAt=${start}&expand=properties`,
      );
      comments.push(...(data.comments || []));
      start += data.comments?.length || 0;
      if (start >= data.total) return comments;
      if (!data.comments?.length) break;
    }
    throw new Error("Jira comment pagination incomplete.");
  }
  async comment(
    key: string,
    text: string,
    actionId: string,
    visibility?: unknown,
  ) {
    this.allowIssue(key);
    return this.jira(
      `/issue/${encodeURIComponent(key)}/comment`,
      {
        method: "POST",
        body: JSON.stringify({
          body: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          },
          properties: [{ key: "realitySyncAction", value: actionId }],
          ...(visibility ? { visibility } : {}),
        }),
      },
      false,
    );
  }
  async slack(
    method: string,
    params: Record<string, unknown> = {},
    read = false,
  ) {
    const isThreadRead = method === "conversations.replies";
    const token = isThreadRead
      ? process.env.SLACK_USER_TOKEN || process.env.SLACK_BOT_TOKEN
      : process.env.SLACK_BOT_TOKEN;
    assert(token, "Configure a Slack bot token locally.");
    const data = await this.request(
      "slack",
      `https://slack.com/api/${method}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(params),
      },
      read,
    );
    if (!data.ok)
      throw new ProviderError(
        "slack",
        data.error === "ratelimited" ? 429 : 400,
        data.error || "api_error",
        false,
        Number(data.retry_after || 0),
      );
    return data;
  }
  async pagedSlack(
    method: string,
    params: Record<string, unknown>,
    field: string,
  ) {
    let cursor = "";
    const values: any[] = [];
    for (let page = 0; page < 100; page++) {
      const data = await this.slack(
        method,
        { ...params, limit: 100, ...(cursor ? { cursor } : {}) },
        true,
      );
      values.push(...(data[field] || []));
      cursor = data.response_metadata?.next_cursor || "";
      if (!cursor) {
        assert(
          !data.has_more,
          "Slack returned incomplete history without a cursor.",
        );
        return values;
      }
    }
    throw new Error("Slack pagination incomplete.");
  }
  async evidence(entity: EntityT): Promise<EvidenceT[]> {
    assert(
      this.config().slackChannelIds.includes(entity.slackChannelId),
      "Slack channel is outside the allowlist.",
    );
    const info = await this.slack(
      "conversations.info",
      { channel: entity.slackChannelId },
      true,
    );
    let messages = entity.threadTs
      ? await this.pagedSlack(
          "conversations.replies",
          { channel: entity.slackChannelId, ts: entity.threadTs },
          "messages",
        )
      : await this.pagedSlack(
          "conversations.history",
          {
            channel: entity.slackChannelId,
            oldest: String((Date.now() - 30 * 86400000) / 1000),
          },
          "messages",
        );
    if (!entity.threadTs) {
      const replies = await Promise.all(
        messages
          .filter((m) => m.reply_count > 0)
          .map((m) =>
            this.pagedSlack(
              "conversations.replies",
              { channel: entity.slackChannelId, ts: m.ts },
              "messages",
            ),
          ),
      );
      messages.push(...replies.flat());
    }
    const users = new Map<string, any>();
    for (const user of new Set(
      messages.filter((m) => m.user && !m.bot_id).map((m) => m.user),
    ))
      users.set(user, (await this.slack("users.info", { user }, true)).user);
    const unique = new Map(
      messages
        .filter((m) => m.user && !m.bot_id && !users.get(m.user)?.is_bot)
        .map((m) => [m.ts, m]),
    );
    return [...unique.values()].map((m) => ({
      id: `slack:${entity.slackChannelId}:${m.ts}`,
      source: "slack",
      entityId: entity.id,
      authorId: m.user,
      at: new Date(Number(m.ts) * 1000).toISOString(),
      retrievedAt: now(),
      text: m.text || "",
      url: `https://app.slack.com/archives/${entity.slackChannelId}/p${m.ts.replace(".", "")}`,
      channelId: entity.slackChannelId,
      threadTs: m.thread_ts || m.ts,
      private: !!info.channel?.is_private,
    }));
  }
  async snapshot(entity: EntityT): Promise<Snapshot> {
    const [evidence, calendar, jira, issue, defaults] = await Promise.all([
      this.evidence(entity),
      this.calendarGet(entity.calendarId, entity.eventId),
      entity.jiraVersionId ? this.jiraGet(entity.jiraVersionId) : undefined,
      entity.issueKey ? this.issue(entity.issueKey) : undefined,
      this.calendarDefaults(entity.calendarId),
    ]);
    if (jira && entity.jiraProjectId)
      assert(
        String(jira.projectId) === entity.jiraProjectId,
        "Jira version belongs to a different project.",
      );
    const content = {
      entity,
      evidence: evidence.map(({ retrievedAt, ...e }) => e),
      calendar,
      jira,
      issue,
      defaults,
    };
    return {
      id: hash(content),
      entity,
      evidence,
      calendar,
      jira,
      issue,
      defaults,
      retrievedAt: now(),
      complete: true,
      warnings: [],
    };
  }
  async health() {
    const tasks: { name: string; call: () => Promise<any> }[] = [
      { name: "Slack", call: () => this.slack("auth.test", {}, true) },
      {
        name: "Google Calendar",
        call: () => this.cal("/users/me/calendarList?maxResults=1"),
      },
      { name: "Jira", call: () => this.jira("/myself") },
    ];
    return Promise.all(
      tasks.map(async (t) => {
        try {
          await t.call();
          return { name: t.name, connected: true, checkedAt: now() };
        } catch (e) {
          return {
            name: t.name,
            connected: false,
            error: (e as Error).message,
            checkedAt: now(),
          };
        }
      }),
    );
  }
}
export function adfText(value: any): string {
  if (typeof value === "string") return value;
  if (!value) return "";
  return [value.text || "", ...(value.content || []).map(adfText)]
    .filter(Boolean)
    .join(" ");
}
