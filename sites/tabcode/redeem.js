/* @meta
{
  "name": "tabcode/redeem",
  "description": "兑换 TabCode 套餐或加油包",
  "domain": "tabcode.cc",
  "args": {
    "code": { "required": true, "description": "兑换码" },
    "confirmUpgrade": { "required": false, "description": "是否确认升级：true 或 false" },
    "confirmText": { "required": false, "description": "升级确认文本，通常为 确认升级" }
  },
  "capabilities": ["billing", "subscription"],
  "readOnly": false,
  "example": "bb-browser site tabcode/redeem ABCD-1234 --confirmUpgrade true --confirmText 确认升级"
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

  try {
    const code = String(args.code || "").trim();
    if (!code) {
      return { error: "缺少参数 code" };
    }

    const payload = { code };
    const confirmUpgrade = String(args.confirmUpgrade || "").trim().toLowerCase();
    if (confirmUpgrade === "true") {
      payload.confirmUpgrade = true;
      payload.confirmUpgradeText = String(args.confirmText || "确认升级").trim();
    }

    const result = await api("/v1/billing/redeem", {
      method: "POST",
      json: payload
    });

    return result;
  } catch (error) {
    return {
      error: error?.message || "兑换失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
