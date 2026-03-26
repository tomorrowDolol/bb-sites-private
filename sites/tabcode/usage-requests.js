/* @meta
{
  "name": "tabcode/usage-requests",
  "description": "获取 TabCode 调用明细",
  "domain": "tabcode.cc",
  "args": {
    "start": { "required": false, "description": "开始时间，ISO 或可被 Date 解析的字符串" },
    "end": { "required": false, "description": "结束时间，ISO 或可被 Date 解析的字符串" },
    "keyName": { "required": false, "description": "按 Key 名称过滤" },
    "model": { "required": false, "description": "按模型过滤" },
    "page": { "required": false, "description": "页码，默认 1" },
    "pageSize": { "required": false, "description": "每页条数，默认 10" }
  },
  "capabilities": ["usage"],
  "readOnly": true,
  "example": "bb-browser site tabcode/usage-requests --page 1 --pageSize 20 --model gpt-4o-mini"
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

  function toIsoString(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  try {
    const query = new URLSearchParams();
    const start = toIsoString(args.start);
    const end = toIsoString(args.end);
    const keyName = String(args.keyName || "").trim();
    const model = String(args.model || "").trim();
    const page = Math.max(1, toNumber(args.page, 1));
    const pageSize = Math.max(1, Math.min(100, toNumber(args.pageSize, 10)));

    if (start) query.set("start", start);
    if (end) query.set("end", end);
    if (keyName) query.set("keyName", keyName);
    if (model) query.set("model", model);
    query.set("page", String(page));
    query.set("pageSize", String(pageSize));

    const payload = await api(`/v1/usage/requests?${query.toString()}`);
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];

    return {
      page,
      pageSize,
      total: toNumber(payload?.total),
      rows: rows.map((item) => ({
        time: item?.time || null,
        keyName: item?.keyName || "",
        model: item?.model || "",
        inTokens: toNumber(item?.inTokens),
        outTokens: toNumber(item?.outTokens),
        cacheRead: toNumber(item?.cacheRead),
        cacheCreate: toNumber(item?.cacheCreate ?? item?.cache_create),
        costUsd: toNumber(item?.costUsd),
        durationSec: toNumber(item?.durationSec),
        ttfbSec: toNumber(item?.ttfbSec),
        stream: !!item?.stream
      }))
    };
  } catch (error) {
    return {
      error: error?.message || "获取调用明细失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
