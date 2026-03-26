/* @meta
{
  "name": "senssun/device-query",
  "description": "按设备 ID 查询香山大数据平台设备绑定信息",
  "domain": "inside.senssun.com",
  "args": {
    "deviceId": { "required": true, "description": "设备 ID" },
    "appId": { "required": false, "description": "指定应用 ID；默认取当前页面选择的 appId" }
  },
  "capabilities": ["query", "device", "account"],
  "readOnly": true,
  "example": "bb-browser site senssun/device-query --deviceId 000113032964FB0141376B --appId APP-ZL-202008151020"
}
*/
async function (args) {
  const loginHint = "请先在当前浏览器登录香山大数据平台，再重试。目标页面通常是 http://inside.senssun.com/bigdata/index.html#/data-cloud/device-query 。";
  const apiBaseUrl = "https://analyze.senssun.com";
  const tokenStorageKey = "xs-token";
  const appStorageKey = "appId";
  const preferredAppId = "APP-ZL-202008151020";

  function makeError(message, extra = {}) {
    const error = new Error(message);
    Object.assign(error, extra);
    return error;
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function trimText(value) {
    return String(value == null ? "" : value).trim();
  }

  function parseJson(value, fallback) {
    if (value == null || value === "") return fallback;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return fallback;
    }
  }

  function filterDefinedEntries(object) {
    return Object.entries(object || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  }

  function buildQueryString(query) {
    const params = new URLSearchParams();
    for (const [key, value] of filterDefinedEntries(query)) {
      params.append(key, String(value));
    }
    return params.toString();
  }

  function buildSignaturePayload(method, query, body) {
    if (String(method || "GET").toUpperCase() === "GET") {
      return filterDefinedEntries(query)
        .map(([, value]) => String(value))
        .join("");
    }
    return JSON.stringify(body == null ? {} : body);
  }

  function rotateLeft(value, shift) {
    return (value << shift) | (value >>> (32 - shift));
  }

  function addUnsigned(left, right) {
    const leftLow = left & 0xffff;
    const leftHigh = left >> 16;
    const rightLow = right & 0xffff;
    const rightHigh = right >> 16;
    const low = leftLow + rightLow;
    const high = leftHigh + rightHigh + (low >> 16);
    return (high << 16) | (low & 0xffff);
  }

  function ff(a, b, c, d, x, s, ac) {
    return addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, (b & c) | (~b & d)), addUnsigned(x, ac)), s), b);
  }

  function gg(a, b, c, d, x, s, ac) {
    return addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, (b & d) | (c & ~d)), addUnsigned(x, ac)), s), b);
  }

  function hh(a, b, c, d, x, s, ac) {
    return addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, b ^ c ^ d), addUnsigned(x, ac)), s), b);
  }

  function ii(a, b, c, d, x, s, ac) {
    return addUnsigned(rotateLeft(addUnsigned(addUnsigned(a, c ^ (b | ~d)), addUnsigned(x, ac)), s), b);
  }

  function convertToWordArray(input) {
    const encoded = unescape(encodeURIComponent(input));
    const length = encoded.length;
    const wordCount = (((length + 8) >>> 6) + 1) * 16;
    const words = new Array(wordCount).fill(0);

    for (let index = 0; index < length; index += 1) {
      words[index >> 2] |= encoded.charCodeAt(index) << ((index % 4) * 8);
    }

    words[length >> 2] |= 0x80 << ((length % 4) * 8);
    words[wordCount - 2] = length * 8;
    return words;
  }

  function wordToHex(value) {
    let result = "";
    for (let index = 0; index <= 3; index += 1) {
      const byte = (value >>> (index * 8)) & 255;
      result += byte.toString(16).padStart(2, "0");
    }
    return result;
  }

  function md5(input) {
    const words = convertToWordArray(input);
    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    for (let index = 0; index < words.length; index += 16) {
      const aa = a;
      const bb = b;
      const cc = c;
      const dd = d;

      a = ff(a, b, c, d, words[index + 0], 7, 0xd76aa478);
      d = ff(d, a, b, c, words[index + 1], 12, 0xe8c7b756);
      c = ff(c, d, a, b, words[index + 2], 17, 0x242070db);
      b = ff(b, c, d, a, words[index + 3], 22, 0xc1bdceee);
      a = ff(a, b, c, d, words[index + 4], 7, 0xf57c0faf);
      d = ff(d, a, b, c, words[index + 5], 12, 0x4787c62a);
      c = ff(c, d, a, b, words[index + 6], 17, 0xa8304613);
      b = ff(b, c, d, a, words[index + 7], 22, 0xfd469501);
      a = ff(a, b, c, d, words[index + 8], 7, 0x698098d8);
      d = ff(d, a, b, c, words[index + 9], 12, 0x8b44f7af);
      c = ff(c, d, a, b, words[index + 10], 17, 0xffff5bb1);
      b = ff(b, c, d, a, words[index + 11], 22, 0x895cd7be);
      a = ff(a, b, c, d, words[index + 12], 7, 0x6b901122);
      d = ff(d, a, b, c, words[index + 13], 12, 0xfd987193);
      c = ff(c, d, a, b, words[index + 14], 17, 0xa679438e);
      b = ff(b, c, d, a, words[index + 15], 22, 0x49b40821);

      a = gg(a, b, c, d, words[index + 1], 5, 0xf61e2562);
      d = gg(d, a, b, c, words[index + 6], 9, 0xc040b340);
      c = gg(c, d, a, b, words[index + 11], 14, 0x265e5a51);
      b = gg(b, c, d, a, words[index + 0], 20, 0xe9b6c7aa);
      a = gg(a, b, c, d, words[index + 5], 5, 0xd62f105d);
      d = gg(d, a, b, c, words[index + 10], 9, 0x02441453);
      c = gg(c, d, a, b, words[index + 15], 14, 0xd8a1e681);
      b = gg(b, c, d, a, words[index + 4], 20, 0xe7d3fbc8);
      a = gg(a, b, c, d, words[index + 9], 5, 0x21e1cde6);
      d = gg(d, a, b, c, words[index + 14], 9, 0xc33707d6);
      c = gg(c, d, a, b, words[index + 3], 14, 0xf4d50d87);
      b = gg(b, c, d, a, words[index + 8], 20, 0x455a14ed);
      a = gg(a, b, c, d, words[index + 13], 5, 0xa9e3e905);
      d = gg(d, a, b, c, words[index + 2], 9, 0xfcefa3f8);
      c = gg(c, d, a, b, words[index + 7], 14, 0x676f02d9);
      b = gg(b, c, d, a, words[index + 12], 20, 0x8d2a4c8a);

      a = hh(a, b, c, d, words[index + 5], 4, 0xfffa3942);
      d = hh(d, a, b, c, words[index + 8], 11, 0x8771f681);
      c = hh(c, d, a, b, words[index + 11], 16, 0x6d9d6122);
      b = hh(b, c, d, a, words[index + 14], 23, 0xfde5380c);
      a = hh(a, b, c, d, words[index + 1], 4, 0xa4beea44);
      d = hh(d, a, b, c, words[index + 4], 11, 0x4bdecfa9);
      c = hh(c, d, a, b, words[index + 7], 16, 0xf6bb4b60);
      b = hh(b, c, d, a, words[index + 10], 23, 0xbebfbc70);
      a = hh(a, b, c, d, words[index + 13], 4, 0x289b7ec6);
      d = hh(d, a, b, c, words[index + 0], 11, 0xeaa127fa);
      c = hh(c, d, a, b, words[index + 3], 16, 0xd4ef3085);
      b = hh(b, c, d, a, words[index + 6], 23, 0x04881d05);
      a = hh(a, b, c, d, words[index + 9], 4, 0xd9d4d039);
      d = hh(d, a, b, c, words[index + 12], 11, 0xe6db99e5);
      c = hh(c, d, a, b, words[index + 15], 16, 0x1fa27cf8);
      b = hh(b, c, d, a, words[index + 2], 23, 0xc4ac5665);

      a = ii(a, b, c, d, words[index + 0], 6, 0xf4292244);
      d = ii(d, a, b, c, words[index + 7], 10, 0x432aff97);
      c = ii(c, d, a, b, words[index + 14], 15, 0xab9423a7);
      b = ii(b, c, d, a, words[index + 5], 21, 0xfc93a039);
      a = ii(a, b, c, d, words[index + 12], 6, 0x655b59c3);
      d = ii(d, a, b, c, words[index + 3], 10, 0x8f0ccc92);
      c = ii(c, d, a, b, words[index + 10], 15, 0xffeff47d);
      b = ii(b, c, d, a, words[index + 1], 21, 0x85845dd1);
      a = ii(a, b, c, d, words[index + 8], 6, 0x6fa87e4f);
      d = ii(d, a, b, c, words[index + 15], 10, 0xfe2ce6e0);
      c = ii(c, d, a, b, words[index + 6], 15, 0xa3014314);
      b = ii(b, c, d, a, words[index + 13], 21, 0x4e0811a1);
      a = ii(a, b, c, d, words[index + 4], 6, 0xf7537e82);
      d = ii(d, a, b, c, words[index + 11], 10, 0xbd3af235);
      c = ii(c, d, a, b, words[index + 2], 15, 0x2ad7d2bb);
      b = ii(b, c, d, a, words[index + 9], 21, 0xeb86d391);

      a = addUnsigned(a, aa);
      b = addUnsigned(b, bb);
      c = addUnsigned(c, cc);
      d = addUnsigned(d, dd);
    }

    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toUpperCase();
  }

  function buildSign(payloadText, token, timestamp) {
    const firstRound = md5(`${payloadText}${token}${timestamp}senssunhealth`).toUpperCase();
    return md5(`senssuntwice${firstRound}`).toUpperCase();
  }

  async function api(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const query = options.query || {};
    const body = options.body;
    const token = trimText(localStorage.getItem(tokenStorageKey));

    if (!token) {
      throw makeError("未登录香山大数据平台", {
        status: 401,
        code: "missing_session",
        hint: loginHint
      });
    }

    const timestamp = Date.now();
    const payloadText = buildSignaturePayload(method, query, body);
    const headers = {
      Accept: "application/json, text/plain, */*",
      token,
      time: String(timestamp),
      sign: buildSign(payloadText, token, timestamp)
    };

    let url = `${apiBaseUrl}${path}`;
    if (method === "GET") {
      const queryString = buildQueryString(query);
      if (queryString) url += `?${queryString}`;
    } else {
      headers["Content-Type"] = "application/json;charset=UTF-8";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(body == null ? {} : body)
    });

    const text = await response.text();
    const data = parseJson(text, null);
    if (!response.ok || !data) {
      throw makeError(`调用香山接口失败: ${path}`, {
        status: response.status,
        code: "http_error",
        hint: response.status === 401 ? loginHint : undefined,
        data: text || null
      });
    }

    if (data.errorCode === 402) {
      throw makeError("登录失效，请重新登录香山大数据平台", {
        status: 401,
        code: "session_expired",
        hint: loginHint,
        data
      });
    }

    if (data.errorCode === 301) {
      throw makeError("香山接口返回业务拒绝", {
        status: 400,
        code: "business_rejected",
        hint: data.message || undefined,
        data
      });
    }

    if (data.errorCode !== undefined && data.errorCode !== 0) {
      throw makeError(data.message || `香山接口返回错误: ${path}`, {
        status: 400,
        code: data.errorCode,
        data
      });
    }

    return data;
  }

  function resolveSelectedAppId(requestedAppId, apps) {
    const availableIds = new Set(apps.map((item) => item.appId));
    const currentStorageAppId = trimText(localStorage.getItem(appStorageKey));
    const candidates = [trimText(requestedAppId), currentStorageAppId, preferredAppId, apps[0]?.appId || ""];

    for (const candidate of candidates) {
      if (candidate && availableIds.has(candidate)) {
        return {
          appId: candidate,
          source:
            candidate === trimText(requestedAppId)
              ? "arg"
              : candidate === currentStorageAppId
                ? "storage"
                : candidate === preferredAppId
                  ? "preferred_default"
                  : "first_available"
        };
      }
    }

    return { appId: null, source: null };
  }

  function formatTimestamp(timestamp) {
    const number = Number(timestamp);
    if (!Number.isFinite(number) || number <= 0) return null;
    return new Date(number).toISOString();
  }

  function normalizeDevice(device) {
    return {
      accountId: device?.accountId || null,
      deviceId: device?.deviceId || null,
      name: device?.name || null,
      productId: device?.productId || null,
      supplierId: device?.supplierId || null,
      source: device?.source || null,
      serialNumber: device?.serialNumber || null,
      createTime: device?.createTime || null,
      createTimeAt: formatTimestamp(device?.createTime)
    };
  }

  try {
    const deviceId = trimText(args.deviceId);
    if (!deviceId) {
      throw makeError("缺少必填参数 deviceId", {
        status: 400,
        code: "missing_device_id",
        hint: "示例：bb-browser site senssun/device-query --deviceId 000113032964FB0141376B"
      });
    }

    const appResponse = await api("/admin/v1/api/base/base/getAppInfo");
    const apps = (Array.isArray(appResponse?.data) ? appResponse.data : [])
      .map((item) => ({ appId: item?.appId || null, appName: item?.appName || null }))
      .filter((item) => item.appId);

    const selection = resolveSelectedAppId(args.appId, apps);
    if (!selection.appId) {
      throw makeError("当前账号没有可用应用，无法执行设备查询", {
        status: 404,
        code: "missing_app",
        data: {
          availableApps: apps,
          requestedAppId: args.appId || null
        }
      });
    }

    const response = await api("/admin/v1/api/user/device/getDeviceList", {
      query: {
        appId: selection.appId,
        deviceId
      }
    });

    const items = Array.isArray(response?.data) ? response.data.map(normalizeDevice) : [];
    if (items.length === 0) {
      throw makeError("未找到匹配设备", {
        status: 404,
        code: "device_not_found",
        data: {
          appId: selection.appId,
          deviceId
        }
      });
    }

    const reportedCount = toNumber(response?.count, items.length);

    return {
      fetchedAt: new Date().toISOString(),
      query: {
        deviceId
      },
      app: {
        selected: {
          appId: selection.appId,
          appName: apps.find((item) => item.appId === selection.appId)?.appName || null,
          source: selection.source
        },
        currentStorageAppId: trimText(localStorage.getItem(appStorageKey)) || null,
        availableApps: apps
      },
      counts: {
        reported: reportedCount,
        returned: items.length,
        matched: Math.max(reportedCount, items.length)
      },
      items
    };
  } catch (error) {
    return {
      error: error?.message || "查询香山设备失败",
      code: error?.code,
      status: error?.status,
      hint: error?.hint || (error?.status === 401 ? loginHint : undefined),
      data: error?.data
    };
  }
}
