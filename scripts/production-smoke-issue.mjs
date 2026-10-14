/**
 * Scheduled production-smoke incident tracker.
 *
 * Creates at most one open GitHub Issue for a failing production check,
 * closes that issue after a successful scheduled check, and never includes
 * request headers, credentials, or passenger data in the issue.
 *
 * Requires the workflow's short-lived GITHUB_TOKEN (issues: write).
 */
import { pathToFileURL } from "node:url";

export const ISSUE_TITLE = "[Production monitor] طريق الشام: فشل فحص الموقع والخادم";

export function decideIncidentAction(result, hasOpenIncident) {
  if (result === "failure" && !hasOpenIncident) return "open";
  if (result === "success" && hasOpenIncident) return "resolve";
  return "none";
}

async function githubRequest(path, { method = "GET", body } = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw Error("GITHUB_TOKEN is required for incident tracking");
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "tareeqalsham-production-monitor",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw Error(`GitHub incident request failed: HTTP ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function findOpenIncident(repository) {
  // GET /issues includes pull requests: identify only our exact titled issue.
  for (let page = 1; page <= 3; page += 1) {
    const issues = await githubRequest(`/repos/${repository}/issues?state=open&per_page=100&page=${page}`);
    const incident = issues.find((item) => !item.pull_request && item.title === ISSUE_TITLE);
    if (incident) return incident;
    if (issues.length < 100) return null;
  }
  throw Error("Cannot safely deduplicate incident issue across all open issues");
}

export async function trackProductionIncident() {
  const repository = process.env.GITHUB_REPOSITORY;
  const result = process.env.SMOKE_STATUS;
  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw Error("Invalid GITHUB_REPOSITORY");
  }
  if (!["success", "failure"].includes(result)) {
    console.log("Production incident tracking skipped: job did not finish normally");
    return;
  }

  const existing = await findOpenIncident(repository);
  const action = decideIncidentAction(result, Boolean(existing));
  const runUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;

  if (action === "open") {
    const created = await githubRequest(`/repos/${repository}/issues`, {
      method: "POST",
      body: {
        title: ISSUE_TITLE,
        body: [
          "فشل فحص الإنتاج المجدول لمنصة طريق الشام. يرجى مراجعة الموقع والخادم.",
          "",
          `تشغيل الفحص: ${runUrl}`,
          "",
          "تم إنشاء هذا البلاغ آليًا؛ لا يحتوي بيانات حجوزات أو مستخدمين.",
          "سيُغلق البلاغ تلقائيًا بعد أول فحص مجدول ناجح.",
        ].join("\n"),
      },
    });
    console.log(`Production incident created: ${created.html_url}`);
  } else if (action === "resolve") {
    await githubRequest(`/repos/${repository}/issues/${existing.number}`, {
      method: "PATCH",
      body: { state: "closed", state_reason: "completed" },
    });
    console.log(`Production incident resolved: issue #${existing.number}`);
  } else {
    console.log(`Production incident unchanged: ${result}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  trackProductionIncident().catch((error) => {
    // The underlying smoke job still reports its true result if tracking fails.
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
