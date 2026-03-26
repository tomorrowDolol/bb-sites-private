/* @meta
{
  "name": "tabcode/keys",
  "description": "获取 TabCode API Key 列表",
  "domain": "tabcode.cc",
  "args": {
    "includeRecent": { "required": false, "description": "附带最近使用记录条数，默认 5" },
    "usageRange": { "required": false, "description": "统计时间窗，默认 7d" }
  },
  "capabilities": ["api-keys"],
  "readOnly": true,
  "example": "bb-browser site tabcode/keys --includeRecent 10 --usageRange 30d"
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
    const includeRecent = Math.max(0, Math.min(50, toNumber(args.includeRecent, 5)));
    const usageRange = String(args.usageRange || "7d");
    const query = new URLSearchParams({
      includeRecent: String(includeRecent),
      usageRange
    });

    const items = await api(`/v1/keys?${query.toString()}`);
    return Array.isArray(items)
      ? items.map((item) => ({
          id: item?.id || "",
          name: item?.name || "",
          preview: item?.preview || "",
          secret: item?.secret || null,
          status: item?.status || "unknown",
          createdAt: item?.createdAt || null,
          lastUsed: item?.lastUsed || null,
          expiresAt: item?.expiresAt || null,
          usageTotals: item?.usageTotals
            ? {
                tokens: toNumber(item.usageTotals.tokens),
                costUsd: toNumber(item.usageTotals.costUsd)
              }
            : null,
          recentUsages: Array.isArray(item?.recentUsages)
            ? item.recentUsages.map((usage) => ({
                time: usage?.time || null,
                model: usage?.model || "",
                tokens: toNumber(usage?.tokens),
                costUsd: toNumber(usage?.costUsd)
              }))
            : []
        }))
      : [];
  } catch (error) {
    return {
      error: error?.message || "获取 API Key 列表失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
