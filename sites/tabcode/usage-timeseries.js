/* @meta
{
  "name": "tabcode/usage-timeseries",
  "description": "获取 TabCode 时序统计",
  "domain": "tabcode.cc",
  "args": {
    "start": { "required": false, "description": "开始时间，默认最近 7 天" },
    "end": { "required": false, "description": "结束时间，默认现在" },
    "granularity": { "required": false, "description": "粒度：hour 或 day，默认 day" },
    "groupBy": { "required": false, "description": "可选分组字段，例如 model" }
  },
  "capabilities": ["usage"],
  "readOnly": true,
  "example": "bb-browser site tabcode/usage-timeseries --granularity hour --groupBy model"
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

  function toIsoString(value, fallback) {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  try {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const granularity = ["hour", "day"].includes(String(args.granularity || "").trim())
      ? String(args.granularity).trim()
      : "day";
    const groupBy = String(args.groupBy || "").trim();

    const query = new URLSearchParams({
      start: toIsoString(args.start, start.toISOString()),
      end: toIsoString(args.end, end.toISOString()),
      granularity
    });
    if (groupBy) query.set("groupBy", groupBy);

    const items = await api(`/v1/usage/timeseries?${query.toString()}`);
    return Array.isArray(items)
      ? items.map((item) => ({
          time: item?.time || null,
          model: item?.model || item?.group || null,
          calls: toNumber(item?.calls),
          costUsd: toNumber(item?.costUsd)
        }))
      : [];
  } catch (error) {
    return {
      error: error?.message || "获取时序统计失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
