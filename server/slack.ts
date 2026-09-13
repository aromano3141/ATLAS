import bolt from "@slack/bolt";
import type { Runtime } from "./api.ts";
import { hash, assert, now } from "./util.ts";
const { App } = bolt;
export async function startSlack(r: Runtime) {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) return;
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
    clientOptions: { retryConfig: { retries: 0 } },
  });
  app.event("message", async ({ event, body }) => {
    const e = event as any;
    if (!e.user || e.bot_id) return;
    const key = (body as any).event_id || hash(e);
    if (r.service.store.get("callback", key)) return;
    r.service.store.transaction(() => {
      r.service.store.immutable("callback", key, { at: now() });
      if (r.service.config().slackChannelIds.includes(e.channel)) {
        const clarification = r.service.store.get(
          "clarification",
          `${e.channel}:${e.thread_ts}`,
        );
        if (clarification)
          r.service.store.immutable("clarificationReply", key, {
            entityId: clarification.entityId,
            channel: e.channel,
            author: e.user,
            at: e.ts,
            text: e.text,
            threadTs: e.thread_ts,
          });
        r.service.store.enqueue("scan", `slack:${key}`, {});
        r.service.store.log("slack_evidence_arrived", {
          channel: e.channel,
          author: e.user,
          at: e.ts,
        });
      }
    });
  });
  app.action(
    /rs_(approve|send|dismiss|review|edit)/,
    async ({ ack, body, action, client }) => {
      await ack();
      const a = action as any;
      const value = String(a.value || "");
      const actor = body.user.id;
      try {
        assert(
          r.service.config().approverSlackIds.includes(actor),
          "This Slack user is not an authorized operator.",
        );
        const [objectId, revision] = value.split(":");
        if (a.action_id === "rs_approve") {
          r.service.approve(objectId, actor);
          return;
        }
        if (a.action_id === "rs_send") {
          await r.messages.approveSend(objectId, revision, actor);
          return;
        }
        if (a.action_id === "rs_dismiss") {
          r.messages.dismiss(objectId, revision);
          return;
        }
        if (a.action_id === "rs_review") {
          const p = r.service.plan(objectId);
          await client.views.open({
            trigger_id: (body as any).trigger_id,
            view: {
              type: "modal",
              title: { type: "plain_text", text: "Repair evidence" },
              close: { type: "plain_text", text: "Close" },
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "plain_text",
                    text: JSON.stringify(
                      {
                        explanation: p.explanation,
                        actions: p.actions,
                        assessments: p.assessments,
                      },
                      null,
                      2,
                    ).slice(0, 2900),
                  },
                },
              ],
            },
          });
          return;
        }
        if (a.action_id === "rs_edit") {
          const d = r.messages.get(objectId);
          assert(
            d.revision === revision,
            "Draft changed. Open the current revision.",
          );
          await client.views.open({
            trigger_id: (body as any).trigger_id,
            view: {
              type: "modal",
              callback_id: "rs_edit_submit",
              private_metadata: value,
              title: { type: "plain_text", text: "Edit message" },
              submit: { type: "plain_text", text: "Save draft" },
              close: { type: "plain_text", text: "Cancel" },
              blocks: [
                {
                  type: "input",
                  block_id: "message",
                  label: { type: "plain_text", text: "Exact message" },
                  element: {
                    type: "plain_text_input",
                    action_id: "text",
                    multiline: true,
                    initial_value: d.text,
                  },
                },
              ],
            },
          });
        }
      } catch (error) {
        r.service.store.log("slack_action_rejected", {
          actor,
          error: (error as Error).message,
        });
        if ((body as any).trigger_id)
          await client.views
            .open({
              trigger_id: (body as any).trigger_id,
              view: {
                type: "modal",
                title: { type: "plain_text", text: "Action needs review" },
                close: { type: "plain_text", text: "Close" },
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "plain_text",
                      text: (error as Error).message,
                    },
                  },
                ],
              },
            })
            .catch(() => {});
      }
    },
  );
  app.view("rs_edit_submit", async ({ ack, body, view }) => {
    try {
      assert(
        r.service.config().approverSlackIds.includes(body.user.id),
        "User is not authorized.",
      );
      const [draftId, revision] = view.private_metadata.split(":");
      r.messages.edit(
        draftId,
        revision,
        view.state.values.message.text.value || "",
      );
      await ack();
    } catch (error) {
      await ack({
        response_action: "errors",
        errors: { message: (error as Error).message },
      });
    }
  });
  await app.start();
  r.service.store.log("slack_socket_connected", { at: now() });
  return app;
}
export function repairBlocks(planId: string, title: string) {
  return [
    {
      type: "section",
      text: {
        type: "plain_text",
        text: `Review the proposed repair for ${title}.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "rs_review",
          text: { type: "plain_text", text: "Review evidence" },
          value: planId,
        },
        {
          type: "button",
          action_id: "rs_approve",
          text: { type: "plain_text", text: "Approve repair" },
          value: planId,
        },
      ],
    },
  ];
}
export function draftBlocks(draftId: string, revision: string, text: string) {
  return [
    {
      type: "section",
      text: { type: "plain_text", text: text.slice(0, 2900) },
    },
    {
      type: "actions",
      elements: ["edit", "send", "dismiss"].map((action) => ({
        type: "button",
        action_id: "rs_" + action,
        text: {
          type: "plain_text",
          text: action[0].toUpperCase() + action.slice(1),
        },
        value: `${draftId}:${revision}`,
      })),
    },
  ];
}
