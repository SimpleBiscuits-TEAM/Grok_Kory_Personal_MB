import { TRPCError } from "@trpc/server";
import { PPEI_DATALOG_SUPPORT_EMAIL } from "@shared/const";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

async function notifyManusForge(
  title: string,
  content: string
): Promise<boolean> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    return false;
  }

  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Manus Forge failed (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Manus Forge error:", error);
    return false;
  }
}

/**
 * POST the same payload to your own endpoint (parallel to Manus).
 * Body includes `text` (Slack-compatible) plus `title` and `content` for custom handlers.
 */
async function notifyOwnerWebhook(
  title: string,
  content: string
): Promise<boolean> {
  const url = ENV.ownerAlertWebhookUrl;
  if (!url) {
    return false;
  }

  const text = `${title}\n\n${content}`;
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (ENV.ownerAlertWebhookSecret) {
    headers.authorization = `Bearer ${ENV.ownerAlertWebhookSecret}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, title, content }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Owner webhook failed (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Owner webhook error:", error);
    return false;
  }
}

const RESEND_API = "https://api.resend.com/emails";
const EMAIL_SUBJECT_MAX = 200;

/**
 * Send the same alert as email via [Resend](https://resend.com) (no extra npm deps — uses fetch).
 * Requires a verified domain + API key in the Resend dashboard.
 */
async function notifyOwnerEmail(
  title: string,
  content: string
): Promise<boolean> {
  if (!ENV.resendApiKey || !ENV.ownerAlertEmailFrom) {
    return false;
  }

  const to = ENV.ownerAlertEmailTo || PPEI_DATALOG_SUPPORT_EMAIL;
  const subject =
    title.length > EMAIL_SUBJECT_MAX
      ? `${title.slice(0, EMAIL_SUBJECT_MAX - 3)}...`
      : title;

  try {
    const response = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.ownerAlertEmailFrom,
        to: [to],
        subject,
        text: `${title}\n\n${content}`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Resend email failed (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Resend email error:", error);
    return false;
  }
}

/**
 * Dispatches owner alerts in parallel:
 * 1. Manus Forge `SendNotification` when `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY` are set (hosted Manus behavior).
 * 2. Your own HTTPS webhook when `OWNER_ALERT_WEBHOOK_URL` is set (Slack, Zapier, internal API, etc.).
 * 3. Email via Resend when `RESEND_API_KEY` + `OWNER_ALERT_EMAIL_FROM` are set (defaults to support@ppei.com).
 *
 * Returns `true` if at least one channel succeeded. Does not throw when Forge is unset (local / self-hosted).
 * Validation errors still bubble as TRPC errors.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  const [manusOk, webhookOk, emailOk] = await Promise.all([
    notifyManusForge(title, content),
    notifyOwnerWebhook(title, content),
    notifyOwnerEmail(title, content),
  ]);

  if (!manusOk && !webhookOk && !emailOk) {
    const hasForge = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
    const hasWebhook = Boolean(ENV.ownerAlertWebhookUrl);
    const hasEmail = Boolean(ENV.resendApiKey && ENV.ownerAlertEmailFrom);
    if (!hasForge && !hasWebhook && !hasEmail) {
      console.warn(
        "[Notification] No channels configured (BUILT_IN_FORGE_*, OWNER_ALERT_WEBHOOK_URL, or RESEND_API_KEY + OWNER_ALERT_EMAIL_FROM)"
      );
    }
  }

  return manusOk || webhookOk || emailOk;
}
