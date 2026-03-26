/* @meta
{
  "name": "tabcode/dashboard",
  "description": "获取 TabCode 仪表板聚合信息",
  "domain": "tabcode.cc",
  "args": {
    "limit": { "required": false, "description": "最近兑换记录条数，默认 20" }
  },
  "capabilities": ["dashboard", "billing", "usage"],
  "readOnly": true,
  "example": "bb-browser site tabcode/dashboard --limit 10"
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
    return { text, data };
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
      throw makeError("未登录 TabCode", {
        status: 401,
        code: "missing_session",
        hint: loginHint
      });
    }

    let headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

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
        headers = { ...headers, Authorization: `Bearer ${nextToken}` };
        result = await execute(headers);
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

  function maskId(value) {
    const text = String(value || "-");
    if (text.length <= 8) return text;
    return `${text.slice(0, 4)}****${text.slice(-4)}`;
  }

  try {
    const limit = Math.max(1, Math.min(100, toNumber(args.limit, 20)));

    const [overview, user, keyPriority, redemptions] = await Promise.all([
      api("/v1/dashboard/overview"),
      api("/v1/auth/me"),
      api("/v1/me/key-priority"),
      api(`/v1/billing/redemptions?limit=${limit}`)
    ]);

    return {
      fetchedAt: new Date().toISOString(),
      overview: {
        today: {
          calls: toNumber(overview?.today?.calls),
          costUsd: toNumber(overview?.today?.costUsd)
        },
        month: {
          costUsd: toNumber(overview?.month?.costUsd)
        },
        todayRemainQuotaUsd: overview?.todayRemainQuotaUsd == null ? null : toNumber(overview.todayRemainQuotaUsd),
        todayRemainingPlanUsd: toNumber(overview?.todayRemainingPlanUsd),
        todayRemainingAddonUsd: toNumber(overview?.todayRemainingAddonUsd),
        plan: overview?.plan
          ? {
              name: overview.plan.name || "-",
              status: overview.plan.status || undefined
            }
          : null,
        latestKey: overview?.latestKey
          ? {
              preview: overview.latestKey.preview || "-",
              status: overview.latestKey.status || "-",
              costUsd: toNumber(overview.latestKey.costUsd),
              totalKeys: toNumber(overview.latestKey.totalKeys),
              totalActiveKeys: toNumber(overview.latestKey.totalActiveKeys),
              lastUsed: overview.latestKey.lastUsed || null
            }
          : null
      },
      user: {
        id: user?.id || null,
        maskedId: maskId(user?.id),
        email: user?.email || null,
        displayName: user?.displayName || null,
        totalCostUsd: toNumber(user?.totalCostUsd),
        createdAt: user?.createdAt || null,
        lastLoginAt: user?.lastLoginAt || null
      },
      keyPriority: {
        priority: keyPriority?.priority || "plan_first"
      },
      recentRedemptions: Array.isArray(redemptions)
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
        : []
    };
  } catch (error) {
    return {
      error: error?.message || "获取 dashboard 失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || loginHint,
      data: error?.data
    };
  }
}
