/* @meta
{
  "name": "huawei/overview",
  "description": "获取华为开发者联盟控制台总览摘要",
  "domain": "developer.huawei.com",
  "args": {
    "appLimit": { "required": false, "description": "返回应用预览条数，默认 10，最大 50" }
  },
  "capabilities": ["dashboard", "account", "permissions", "apps"],
  "readOnly": true,
  "example": "bb-browser site huawei/overview --appLimit 10"
}
*/
async function (args) {
  const loginHint = "请先在 bb-browser 受管浏览器中登录华为开发者联盟，再重试。";
  const delegateUrl = "https://svc-drcn.developer.huawei.com/svc/dprm/v1/delegate";
  const stateTexts = {
    verifyRealState: {
      0: "未认证",
      1: "审核中",
      2: "已认证"
    },
    memberState: {
      1: "待接受",
      2: "待激活",
      3: "已认证"
    },
    userType: {
      1: "个人",
      2: "企业"
    }
  };

  function makeError(message, extra = {}) {
    const error = new Error(message);
    Object.assign(error, extra);
    return error;
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(number)));
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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

  function parseCookies() {
    return Object.fromEntries(
      document.cookie
        .split(/;\s*/)
        .filter(Boolean)
        .map((item) => {
          const separatorIndex = item.indexOf("=");
          const key = separatorIndex >= 0 ? item.slice(0, separatorIndex) : item;
          const value = separatorIndex >= 0 ? item.slice(separatorIndex + 1) : "";
          return [decodeURIComponent(key), decodeURIComponent(value)];
        })
    );
  }

  function formatHdDate(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getUTCFullYear(),
      pad(date.getUTCMonth() + 1),
      pad(date.getUTCDate())
    ].join("") + "T" + [
      pad(date.getUTCHours()),
      pad(date.getUTCMinutes()),
      pad(date.getUTCSeconds())
    ].join("") + "Z";
  }

  function buildHeaders(csrfToken) {
    return {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json;charset=UTF-8",
      "X-HD-CSRF": csrfToken,
      "X-HD-DATE": formatHdDate(),
      "X-HD-SERIALNO": String(Math.floor(Math.random() * 900000) + 100000)
    };
  }

  async function delegate(svc, payload, csrfToken, options = {}) {
    const response = await fetch(options.url || delegateUrl, {
      method: "POST",
      credentials: "include",
      headers: buildHeaders(csrfToken),
      body: JSON.stringify({
        svc,
        reqType: options.reqType == null ? 0 : options.reqType,
        reqJson: JSON.stringify(payload)
      })
    });

    const text = await response.text();
    const parsed = parseJson(text, null);
    if (!response.ok || !parsed) {
      throw makeError(`调用华为接口失败: ${svc}`, {
        status: response.status,
        data: text || null
      });
    }

    if (String(parsed.returnCode || "") !== "0") {
      throw makeError(parsed.description || `调用华为接口失败: ${svc}`, {
        status: response.status,
        code: parsed.returnCode,
        data: parsed
      });
    }

    return parseJson(parsed.resJson, {});
  }

  function pickPrimaryRoute(routeList, teamId) {
    if (!Array.isArray(routeList) || routeList.length === 0) return null;
    return (
      routeList.find((item) => String(item?.userID || "") === String(teamId) && toNumber(item?.invalid, 0) === 0) ||
      routeList.find((item) => toNumber(item?.invalid, 0) === 0) ||
      routeList[0]
    );
  }

  function simplifyRoute(route) {
    if (!route) return null;
    const roleIds = Array.isArray(route.channelRoleTypes)
      ? route.channelRoleTypes.map((item) => item?.roleID).filter(Boolean)
      : [];
    const allowLoginRoleIds = Array.isArray(route.channelRoleTypes)
      ? route.channelRoleTypes.filter((item) => toNumber(item?.allowLogin, 0) === 1).map((item) => item?.roleID).filter(Boolean)
      : [];

    return {
      userId: route.userID || null,
      memberUserId: route.memberUserID || null,
      realName: route.realName || null,
      userType: route.userType == null ? null : toNumber(route.userType),
      userTypeText: stateTexts.userType[toNumber(route.userType)] || null,
      verifyRealState: route.verifyRealState == null ? null : toNumber(route.verifyRealState),
      verifyRealStateText: stateTexts.verifyRealState[toNumber(route.verifyRealState)] || null,
      userValidStatus: route.userValidStatus == null ? null : toNumber(route.userValidStatus),
      expireTime: route.expireTime || null,
      lastLoginTime: route.lastLoginTime || null,
      invalid: route.invalid == null ? null : toNumber(route.invalid),
      roleIds,
      allowLoginRoleIds
    };
  }

  function pickLatestVersion(app) {
    if (!Array.isArray(app?.versionList) || app.versionList.length === 0) return null;
    return [...app.versionList].sort((left, right) => toNumber(right?.updateTime) - toNumber(left?.updateTime))[0];
  }

  function pickAppName(version) {
    if (!version) return null;
    const languageItem = Array.isArray(version.languages)
      ? version.languages.find((item) => item?.appName) || version.languages[0]
      : null;
    if (languageItem?.appName) return languageItem.appName;
    const packageItem = Array.isArray(version.packageList)
      ? version.packageList.find((item) => item?.appName) || version.packageList[0]
      : null;
    return packageItem?.appName || null;
  }

  function simplifyApp(app) {
    const version = pickLatestVersion(app);
    const packageInfo = Array.isArray(version?.packageList) ? version.packageList[0] || null : null;
    return {
      appId: app?.appId || null,
      appName: pickAppName(version),
      packageType: app?.packageType == null ? null : toNumber(app.packageType),
      appState: app?.appState == null ? null : toNumber(app.appState),
      appDevelopStatus: app?.appDevelopStatus == null ? null : toNumber(app.appDevelopStatus),
      versionName: packageInfo?.versionName || null,
      versionCode: packageInfo?.versionCode == null ? null : toNumber(packageInfo.versionCode),
      updateTime: version?.updateTime || null,
      distCountryList: version?.distCountryList || null,
      icon: app?.appIcon || null
    };
  }

  function summarizeRoleList(teamRoleList) {
    const uniqueEntries = new Map();
    const roles = Array.isArray(teamRoleList)
      ? teamRoleList.map((role) => {
          const resources = Array.isArray(role?.resAbsList)
            ? role.resAbsList.map((resource) => {
                const item = {
                  name: resource?.itemName || null,
                  code: resource?.itemCode || null,
                  classifyCode: resource?.classifyCode || null,
                  description: resource?.itemDesc || null
                };
                const uniqueKey = `${item.classifyCode || "-"}:${item.code || item.name || "-"}`;
                if (!uniqueEntries.has(uniqueKey)) {
                  uniqueEntries.set(uniqueKey, item);
                }
                return item;
              })
            : [];

          return {
            roleType: role?.teamRoleType || null,
            roleName: role?.teamRoleName || null,
            roleDescription: role?.teamRoleDes || null,
            resourceCount: resources.length,
            resources
          };
        })
      : [];

    return {
      roles,
      uniqueEntryCount: uniqueEntries.size,
      uniqueEntries: Array.from(uniqueEntries.values()).sort((left, right) =>
        String(left.name || "").localeCompare(String(right.name || ""))
      )
    };
  }

  try {
    const appLimit = clampNumber(args.appLimit, 10, 1, 50);
    const cookies = parseCookies();
    const userInfo = parseJson(cookies.developer_userinfo || cookies.developer_userdata, {});
    const teamId = String(cookies["x-teamId"] || userInfo.teamid || "").trim();
    const csrfToken = String(userInfo.csrftoken || "").trim();

    if (!teamId || !csrfToken) {
      return {
        error: "未登录华为开发者联盟",
        status: 401,
        code: "missing_session",
        hint: loginHint
      };
    }

    const [
      displayInfo,
      baseInfo,
      routeInfo,
      teamMemberResInfo,
      unreadInfo,
      ticketInfo,
      appsA,
      appsB
    ] = await Promise.all([
      delegate("GOpen.User.getInfo", { getNickName: 1 }, csrfToken),
      delegate(
        "OpenCommon.DelegateTm.OpenUP_Server4User_getDeveloperBaseInfo",
        { req: { userID: teamId } },
        csrfToken
      ),
      delegate(
        "OpenCommon.DelegateTm.OpenUP_Server4User_getUserAllRouteInfo",
        { req: { userID: teamId } },
        csrfToken
      ),
      delegate(
        "OpenCommon.DelegateTm.OpenCommon_Server4User_getTeamMemberResInfo",
        { req: { lang: "zh_CN", userID: teamId } },
        csrfToken
      ),
      delegate(
        "OpenCommon.DelegateTm.OpenMessage_Server4User_queryUnreadMsgNoteNumber",
        { req: { channel: -1, userID: teamId } },
        csrfToken
      ),
      delegate(
        "/partnercareservice/v1/ticket/getuncheckedticketcount",
        { req: { userID: teamId } },
        csrfToken,
        { reqType: 2 }
      ),
      delegate(
        "OpenCommon.DelegateTm.SOpenApp_Server_appListFromAgc",
        { req: { maxReqCount: appLimit, packageType: "1,2,3,4,5,6", state: "-995,101,300,301", userID: teamId } },
        csrfToken
      ),
      delegate(
        "OpenCommon.DelegateTm.SOpenApp_Server_appListFromAgc",
        { req: { maxReqCount: appLimit, packageType: "7,8", state: "-995,101,300,301", userID: teamId } },
        csrfToken
      )
    ]);

    const allApps = [
      ...(Array.isArray(appsA?.appList) ? appsA.appList : []),
      ...(Array.isArray(appsB?.appList) ? appsB.appList : [])
    ];

    const appSampleByPackageType = {};
    for (const app of allApps) {
      const packageType = `packageType_${toNumber(app?.packageType, -1)}`;
      appSampleByPackageType[packageType] = (appSampleByPackageType[packageType] || 0) + 1;
    }

    const previewApps = allApps
      .map(simplifyApp)
      .sort((left, right) => toNumber(right?.updateTime) - toNumber(left?.updateTime))
      .slice(0, appLimit);

    const permissions = summarizeRoleList(teamMemberResInfo?.memberResInfo?.teamRoleList);
    const primaryRoute = simplifyRoute(pickPrimaryRoute(routeInfo?.userRouteInfoList, teamId));

    return {
      fetchedAt: new Date().toISOString(),
      page: {
        title: document.title || null,
        url: location.href
      },
      account: {
        displayName: displayInfo?.displayName || null,
        loginId: displayInfo?.loginID || null,
        userId: displayInfo?.userID || null,
        teamId,
        anonymousMobile: displayInfo?.anonymousMobile || null,
        nationalCode: displayInfo?.nationalCode || null
      },
      developer: {
        realName: baseInfo?.developerInfo?.realName || null,
        auditRoleId: baseInfo?.developerInfo?.auditRoleID || null,
        userType: baseInfo?.developerInfo?.userType == null ? null : toNumber(baseInfo.developerInfo.userType),
        userTypeText: stateTexts.userType[toNumber(baseInfo?.developerInfo?.userType)] || null,
        verifyRealState: baseInfo?.developerInfo?.verifyRealState == null ? null : toNumber(baseInfo.developerInfo.verifyRealState),
        verifyRealStateText: stateTexts.verifyRealState[toNumber(baseInfo?.developerInfo?.verifyRealState)] || null,
        country: baseInfo?.developerInfo?.country || null,
        province: baseInfo?.developerInfo?.province || null,
        city: baseInfo?.developerInfo?.city || null,
        contactEmail: baseInfo?.developerInfo?.contactEmail || null,
        contactPhone: baseInfo?.developerInfo?.contactPhone || null,
        companyAddress: baseInfo?.corpDeveloper?.corpAddress || null
      },
      teamAccount: {
        memberNickName: teamMemberResInfo?.teamMember?.memberNickName || null,
        memberEmail: teamMemberResInfo?.teamMember?.memberEmail || null,
        memberLoginName: teamMemberResInfo?.teamMember?.memberLoginName || null,
        memberState: teamMemberResInfo?.teamMember?.memberState == null ? null : toNumber(teamMemberResInfo.teamMember.memberState),
        memberStateText: stateTexts.memberState[toNumber(teamMemberResInfo?.teamMember?.memberState)] || null,
        effectiveTime: teamMemberResInfo?.teamMember?.effectiveTime || null,
        expireTime: teamMemberResInfo?.teamMember?.expireTime || null
      },
      currentRoute: primaryRoute,
      notifications: {
        unreadNotificationCount: toNumber(unreadInfo?.unReadNoteNumber),
        unreadMessageCount: toNumber(unreadInfo?.unReadMsgNumber),
        uncheckedTicketCount: toNumber(ticketInfo?.value?.count)
      },
      applications: {
        totalCount: toNumber(appsA?.totalCount) + toNumber(appsB?.totalCount),
        appServiceCount: toNumber(appsA?.totalCount),
        harmonyServiceCount: toNumber(appsB?.totalCount),
        fetchedCount: allApps.length,
        sampleByPackageType: appSampleByPackageType,
        preview: previewApps
      },
      permissions
    };
  } catch (error) {
    const message = error?.message || "获取华为开发者总览失败";
    const hint = /90910008|csrf|auth|login|401|403/i.test(message)
      ? loginHint
      : error?.hint || loginHint;

    return {
      error: message,
      code: error?.code,
      status: error?.status,
      hint,
      data: error?.data
    };
  }
}
