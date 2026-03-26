/* @meta
{
  "name": "tabcode/key-create",
  "description": "创建 TabCode API Key",
  "domain": "tabcode.cc",
  "args": {
    "name": { "required": true, "description": "Key 名称，例如 prod 或 test" }
  },
  "capabilities": ["api-keys"],
  "readOnly": false,
  "example": "bb-browser site tabcode/key-create prod"
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
    const name = String(args.name || "").trim();
    if (!name) {
      return { error: "缺少参数 name" };
    }

    const created = await api("/v1/keys", {
      method: "POST",
      json: { name }
    });

    return {
      id: created?.id || "",
      name: created?.name || name,
      preview: created?.preview || "",
      secret: created?.secret || null,
      status: created?.status || "active",
      createdAt: created?.createdAt || null,
      lastUsed: created?.lastUsed || null,
      expiresAt: created?.expiresAt || null
    };
  } catch (error) {
    return {
      error: error?.message || "创建 API Key 失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
