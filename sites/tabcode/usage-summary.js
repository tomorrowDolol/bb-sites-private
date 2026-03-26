/* @meta
{
  "name": "tabcode/usage-summary",
  "description": "获取 TabCode 用量汇总",
  "domain": "tabcode.cc",
  "args": {
    "days": { "required": false, "description": "计算日均调用的窗口天数，默认 7" }
  },
  "capabilities": ["usage"],
  "readOnly": true,
  "example": "bb-browser site tabcode/usage-summary --days 7"
}
*/
async function (args) {
  const loginHint = "请先在浏览器中登录 https://tabcode.cc ，再重试。";

  function makeError(message, extra = {}) {
    const error = new Error(message);
    Object.assign(error, extra);
    return error;
  }

  async function parseResponse(response) {
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }
    return { data };
  }

  async function refreshAccessToken() {
    const refreshToken = localStorage.getItem("auth:refresh_token");
    if (!refreshToken) return null;
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    const { data } = await parseResponse(response);
    if (!response.ok || !data?.accessToken) return null;
    const nextToken = String(data.accessToken);
    localStorage.setItem("auth:access_token", nextToken);
    return nextToken;
  }

  async function api(path, options = {}) {
    const accessToken = localStorage.getItem("auth:access_token");
    const refreshToken = localStorage.getItem("auth:refresh_token");
    if (!accessToken && !refreshToken) {
      throw makeError("未登录 TabCode", { status: 401, code: "missing_session", hint: loginHint });
    }

    let headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const execute = async (finalHeaders) => {
      const response = await fetch(`/api${path}`, {
        method: options.method || "GET",
        headers: finalHeaders,
        body: options.json !== undefined ? JSON.stringify(options.json) : options.body
      });
      const parsed = await parseResponse(response);
      return { response, ...parsed };
    };

    let result = await execute(headers);
    const message = result.data?.message || "";
    if (
      result.response.status === 401 &&
      (message === "Invalid token" || message === "Missing Authorization")
    ) {
      const nextToken = await refreshAccessToken();
      if (nextToken) {
        result = await execute({ ...headers, Authorization: `Bearer ${nextToken}` });
      }
    }

    if (!result.response.ok) {
      throw makeError(result.data?.message || `HTTP ${result.response.status}`, {
        status: result.response.status,
        code: result.data?.code,
        data: result.data,
        hint: result.response.status === 401 ? loginHint : undefined
      });
    }

    return result.data;
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  try {
    const days = Math.max(1, Math.min(30, toNumber(args.days, 7)));
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const timeseriesQuery = new URLSearchParams({
      granularity: "day",
      start: start.toISOString(),
      end: end.toISOString()
    });

    const [today, all, timeseries] = await Promise.all([
      api("/v1/usage/summary?range=today"),
      api("/v1/usage/summary?range=all"),
      api(`/v1/usage/timeseries?${timeseriesQuery.toString()}`)
    ]);

    const byDay = new Map();
    if (Array.isArray(timeseries)) {
      for (const item of timeseries) {
        const day = String(item?.time || "").slice(0, 10);
        if (!day) continue;
        byDay.set(day, (byDay.get(day) || 0) + toNumber(item?.calls));
      }
    }

    const totalCallsInWindow = Array.from(byDay.values()).reduce((sum, value) => sum + value, 0);
    const averageDailyCalls = Math.round(totalCallsInWindow / Math.max(1, byDay.size || days));

    return {
      todayCalls: toNumber(today?.calls),
      totalCalls: toNumber(all?.calls),
      averageDailyCalls,
      windowDays: days,
      timeseriesDays: Array.from(byDay.entries()).map(([day, calls]) => ({ day, calls }))
    };
  } catch (error) {
    return {
      error: error?.message || "获取用量汇总失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
