import { Environment, Paddle, EventName } from "@paddle/paddle-node-sdk";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export { EventName };

export type PaddleEnv = "sandbox" | "live";

/** PaddleEnv's "live" maps to the SDK's Environment.production — "live" isn't a valid SDK value. */
function toSdkEnvironment(env: PaddleEnv): Environment {
  return env === "live" ? Environment.production : Environment.sandbox;
}

export function getPaddleApiKey(env: PaddleEnv): string {
  return env === "sandbox" ? getEnv("PADDLE_SANDBOX_API_KEY") : getEnv("PADDLE_LIVE_API_KEY");
}

export function getPaddleClient(env: PaddleEnv): Paddle {
  return new Paddle(getPaddleApiKey(env), { environment: toSdkEnvironment(env) });
}

export function getWebhookSecret(env: PaddleEnv): string {
  return env === "sandbox"
    ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");
}

export async function verifyWebhook(req: Request, env: PaddleEnv) {
  const signature = req.headers.get("paddle-signature");
  const body = await req.text();
  const secret = getWebhookSecret(env);
  if (!signature || !body) throw new Error("Missing signature or body");
  const paddle = getPaddleClient(env);
  return await paddle.webhooks.unmarshal(body, secret, signature);
}
