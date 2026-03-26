/* @meta
{
  "name": "tabcode/subscription",
  "description": "获取 TabCode 当前套餐与兑换记录",
  "domain": "tabcode.cc",
  "args": {
    "limit": { "required": false, "description": "兑换记录条数，默认 50" }
  },
  "capabilities": ["billing", "subscription"],
  "readOnly": true,
  "example": "bb-browser site tabcode/subscription --limit 20"
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
    const limit = Math.max(1, Math.min(100, toNumber(args.limit, 50)));
    const [current, redemptions] = await Promise.all([
      api("/v1/billing/current"),
      api(`/v1/billing/redemptions?limit=${limit}`)
    ]);

    const normalizedRedemptions = Array.isArray(redemptions)
      ? redemptions.map((item) => ({
          id: item?.id || "",
          planName: item?.planName || "-",
          productType: item?.productType || "addon",
          grantedUsd: toNumber(item?.grantedUsd),
          includedUsd: item?.includedUsd == null ? null : toNumber(item.includedUsd),
          redeemedAt: item?.redeemedAt || null,
          periodStart: item?.periodStart || null,
          periodEnd: item?.periodEnd || null
        }))
      : [];

    return {
      current: {
        name: current?.name || "-",
        status: current?.status || "inactive",
        renewDate: current?.renewDate || null,
        monthlyCreditUsd: toNumber(current?.monthlyCreditUsd),
        monthUsageUsd: toNumber(current?.monthUsageUsd),
        paymentMethod: current?.paymentMethod || null,
        renewalMethod: current?.renewalMethod || null,
        dailyLimitUsd: current?.dailyLimitUsd == null ? null : toNumber(current.dailyLimitUsd)
      },
      redemptions: normalizedRedemptions,
      addons: normalizedRedemptions
        .filter((item) => item.productType === "addon")
        .map((item) => ({
          id: item.id,
          name: item.planName,
          amountTotalUsd: item.grantedUsd,
          amountUsedUsd: 0,
          expireAt: item.periodEnd
        }))
    };
  } catch (error) {
    return {
      error: error?.message || "获取订购信息失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
