type LambdaSuccess = {
  ok: true;
  status: 'sent';
  trigger_id: string;
  downstream_status: number;
  downstream_body: unknown;
};

type LambdaError = {
  ok: false;
  status: 'error';
  trigger_id: string;
  message: string;
  downstream_status?: number;
  downstream_body?: unknown;
};

type LambdaResult = LambdaSuccess | LambdaError;

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

function getEnv(name: string): string | undefined {
  // Prefer Bun runtime env when available.
  const maybeBun = (globalThis as { Bun?: { env?: Record<string, string | undefined> } }).Bun;
  if (maybeBun?.env) {
    return maybeBun.env[name];
  }
  return process.env[name];
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value || value.trim() === '') {
    throw new Error(`[RAILWAY-CALLER] Missing required env var: ${name}`);
  }
  return value;
}

function parseBody(bodyText: string): unknown {
  if (!bodyText) return null;
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

function safeJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function logJson(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'railway-notifier-caller',
    ...meta,
  };
  const output = JSON.stringify(line);
  if (level === 'error') {
    console.error(output);
    return;
  }
  console.log(output);
}

export default async function railwayNotifyRotationCaller(): Promise<LambdaResult> {
  const startedAtMs = Date.now();
  const triggerId = `railway-lambda-${startedAtMs}`;

  try {
    const endpoint = requireEnv('RAILWAY_NOTIFIER_URL');
    const signature = requireEnv('RAILWAY_CRON_SECRET');
    const environment = getEnv('RAILWAY_ENV_LABEL') || getEnv('NODE_ENV') || 'unknown';

    const payload = {
      trigger_id: triggerId,
      scheduled_at: new Date().toISOString(),
      environment,
    };

    logJson('info', 'railway caller started', {
      trigger_id: triggerId,
      endpoint,
      environment,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Railway-Cron-Signature': signature,
      },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    const downstreamBody = parseBody(bodyText);
    const elapsedMs = Date.now() - startedAtMs;

    logJson('info', 'railway caller downstream response', {
      trigger_id: triggerId,
      downstream_status: response.status,
      elapsed_ms: elapsedMs,
      downstream_body: safeJson(downstreamBody),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: 'error',
        trigger_id: triggerId,
        message: `Downstream endpoint returned HTTP ${response.status}`,
        downstream_status: response.status,
        downstream_body: downstreamBody,
      };
    }

    return {
      ok: true,
      status: 'sent',
      trigger_id: triggerId,
      downstream_status: response.status,
      downstream_body: downstreamBody,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAtMs;
    const message = error instanceof Error ? error.message : String(error);

    logJson('error', 'railway caller failed', {
      trigger_id: triggerId,
      elapsed_ms: elapsedMs,
      message,
    });

    return {
      ok: false,
      status: 'error',
      trigger_id: triggerId,
      message,
    };
  }
}

async function main(): Promise<void> {
  logJson('info', 'railway caller runtime started', {
    pid: process.pid,
    runtime: process.version,
  });

  const result = await railwayNotifyRotationCaller();
  const level: LogLevel = result.ok ? 'info' : 'error';

  logJson(level, 'railway caller runtime completed', {
    trigger_id: result.trigger_id,
    status: result.status,
    downstream_status: result.downstream_status,
    ...(result.ok ? {} : { message: result.message }),
  });

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if ((import.meta as { main?: boolean }).main) {
  void main();
}

