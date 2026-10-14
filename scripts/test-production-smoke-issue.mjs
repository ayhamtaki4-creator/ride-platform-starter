import test from "node:test";
import assert from "node:assert/strict";
import { decideIncidentAction, ISSUE_TITLE } from "./production-smoke-issue.mjs";

test("open an incident only on the first failing scheduled check", () => {
  assert.equal(decideIncidentAction("failure", false), "open");
  assert.equal(decideIncidentAction("failure", true), "none");
});

test("resolve incident after recovery without creating a new issue", () => {
  assert.equal(decideIncidentAction("success", true), "resolve");
  assert.equal(decideIncidentAction("success", false), "none");
});

test("cancelled or unknown jobs cannot create incidents", () => {
  assert.equal(decideIncidentAction("cancelled", false), "none");
  assert.match(ISSUE_TITLE, /Production monitor/);
});
