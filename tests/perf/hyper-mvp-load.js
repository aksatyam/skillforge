/**
 * SkillForge Hyper-MVP load test.
 *
 * Exercises the assessment-service paths a typical appraisal-cycle day looks like:
 *   - 80% of users browsing their own data (scorecard + assessments list)
 *   - 15% HR admins pulling reports / roster
 *   - 5% manager scoring / reviewing
 *
 * Target per BUILD_PLAN §11.1 success criteria: 200 concurrent users with
 * p95 <500ms and 0 errors.
 *
 * Run:
 *   k6 run --vus 200 --duration 2m tests/perf/hyper-mvp-load.js
 *   k6 run --vus 50  --duration 30s tests/perf/hyper-mvp-load.js  # smoke
 *
 * Env:
 *   BASE_URL=http://localhost:4001 (default)
 *   EMPLOYEE_EMAIL / MANAGER_EMAIL / HR_EMAIL / PASSWORD (defaults match the seed)
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:4001';
const PASSWORD = __ENV.PASSWORD || 'Passw0rd!';
const EMP = __ENV.EMPLOYEE_EMAIL || 'dev1@qualtech.com';
const MGR = __ENV.MANAGER_EMAIL || 'eng.manager@qualtech.com';
const HR = __ENV.HR_EMAIL || 'hr@qualtech.com';

const loginTrend = new Trend('login_duration', true);
const authErrRate = new Rate('auth_errors');
const readTrend = new Trend('read_duration', true);

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],      // <1% errors
    http_req_duration: ['p(95)<500'],    // p95 under 500ms
    read_duration: ['p(95)<400'],
    auth_errors: ['rate<0.01'],
  },
  scenarios: {
    hyper_mvp_day: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 },
        { duration: '30s', target: 200 },
        { duration: '60s', target: 200 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
};

function login(email) {
  const started = Date.now();
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { op: 'login' } },
  );
  loginTrend.add(Date.now() - started);
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  if (!ok) authErrRate.add(1);
  return ok ? res.json('accessToken') : null;
}

function authedGet(path, token, opName) {
  const started = Date.now();
  const res = http.get(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { op: opName },
  });
  readTrend.add(Date.now() - started);
  check(res, { [`${opName} 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

export default function () {
  const dice = Math.random();

  if (dice < 0.80) {
    // Employee browse path
    group('employee', () => {
      const token = login(EMP);
      if (!token) return;
      authedGet('/auth/me', token, 'me');
      authedGet('/assessments/me', token, 'assessments_me');
      authedGet('/stats/employee/me/scorecard', token, 'scorecard');
      sleep(Math.random() * 2);
    });
  } else if (dice < 0.95) {
    // HR admin path
    group('hr', () => {
      const token = login(HR);
      if (!token) return;
      const cycles = authedGet('/cycles', token, 'cycles');
      const cid = cycles.status === 200 ? cycles.json('0.id') : null;
      if (cid) {
        authedGet(`/cycles/${cid}/progress`, token, 'progress');
        authedGet(`/stats/org/completion?cycleId=${cid}`, token, 'completion');
        authedGet(`/stats/org/score-distribution?cycleId=${cid}`, token, 'distribution');
      }
      sleep(Math.random() * 2);
    });
  } else {
    // Manager path
    group('manager', () => {
      const token = login(MGR);
      if (!token) return;
      authedGet('/assessments/team/list', token, 'team_list');
      authedGet('/stats/manager/team-overview', token, 'team_overview');
      sleep(Math.random() * 2);
    });
  }
}
