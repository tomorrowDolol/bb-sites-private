/* @meta
{
  "name": "tabcode/me",
  "description": "获取 TabCode 当前账户信息",
  "domain": "tabcode.cc",
  "args": {},
  "capabilities": ["account"],
  "readOnly": true,
  "example": "bb-browser site tabcode/me"
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

  async function api(path) {
    const accessToken = localStorage.getItem("auth:access_token");
    const refreshToken = localStorage.getItem("auth:refresh_token");

    if (!accessToken && !refreshToken) {
      throw makeError("未登录 TabCode", {
        status: 401,
        code: "missing_session",
        hint: loginHint
      });
    }

    let headers = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const execute = async (finalHeaders) => {
      const response = await fetch(`/api${path}`, { headers: finalHeaders });
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
    const user = await api("/v1/auth/me");
    return {
      id: user?.id || null,
      email: user?.email || null,
      displayName: user?.displayName || null,
      totalCostUsd: toNumber(user?.totalCostUsd),
      createdAt: user?.createdAt || null,
      lastLoginAt: user?.lastLoginAt || null
    };
  } catch (error) {
    return {
      error: error?.message || "获取账户信息失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
