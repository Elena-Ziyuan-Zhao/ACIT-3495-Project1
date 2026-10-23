#!/usr/bin/env node
'use strict';

/**
 * Repeatable Load Testing Script for ACIT 3495 Project 1
 * Usage:
 *   node scripts/load-test.js [url] [totalRequests] [concurrency]
 *
 * Example:
 *   node scripts/load-test.js http://localhost:8081/api/stats 500 20
 */

const targetUrl = process.argv[2] || process.env.TARGET_URL || 'http://localhost:8081/health';
const totalRequests = parseInt(process.argv[3] || process.env.TOTAL_REQUESTS || '500', 10);
const concurrency = parseInt(process.argv[4] || process.env.CONCURRENCY || '20', 10);

async function getAuthToken() {
  if (process.env.AUTH_TOKEN) return process.env.AUTH_TOKEN;

  // Try host localhost:3000 or docker container auth-service:3000
  const authUrls = [
    'http://auth-service:3000/login',
    'http://localhost:3000/login'
  ];

  for (const url of authUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: process.env.AUTH_SEED_USERNAME || 'demo',
          password: process.env.AUTH_SEED_PASSWORD || 'demopassword123'
        }),
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        return data.token;
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function run() {
  console.log(`\n========================================`);
  console.log(`  ACIT 3495 - Microservices Load Test`);
  console.log(`========================================`);
  console.log(`Target URL:     ${targetUrl}`);
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Concurrency:    ${concurrency}`);

  let token = null;
  if (targetUrl.includes('/api/stats') || targetUrl.includes('/entries')) {
    process.stdout.write(`Fetching authentication JWT token... `);
    token = await getAuthToken();
    if (token) {
      console.log(`[OK]`);
    } else {
      console.log(`[WARN: None found, sending unauthenticated]`);
    }
  }

  console.log(`Starting load test in 1 second...\n`);
  await new Promise(r => setTimeout(r, 1000));

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const latencies = [];
  const statusCodes = {};
  let errors = 0;
  let completed = 0;
  let dispatched = 0;

  const startTime = Date.now();

  async function worker() {
    while (dispatched < totalRequests) {
      dispatched++;
      const reqStart = Date.now();
      try {
        const res = await fetch(targetUrl, { headers });
        const latency = Date.now() - reqStart;
        latencies.push(latency);
        statusCodes[res.status] = (statusCodes[res.status] || 0) + 1;
        if (!res.ok) errors++;
      } catch (err) {
        errors++;
        statusCodes['ERR'] = (statusCodes['ERR'] || 0) + 1;
      }
      completed++;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const totalTimeSec = (Date.now() - startTime) / 1000;
  latencies.sort((a, b) => a - b);

  const avgLatency = latencies.length ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2) : 0;
  const minLatency = latencies.length ? latencies[0] : 0;
  const maxLatency = latencies.length ? latencies[latencies.length - 1] : 0;
  const p95Latency = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const throughput = (completed / totalTimeSec).toFixed(2);
  const errorRate = ((errors / totalRequests) * 100).toFixed(2);

  console.log(`---------------- RESULTS ----------------`);
  console.log(`Total Time Taken:  ${totalTimeSec.toFixed(2)} s`);
  console.log(`Throughput:        ${throughput} req/s`);
  console.log(`Avg Latency:       ${avgLatency} ms`);
  console.log(`p95 Latency:       ${p95Latency} ms`);
  console.log(`Min Latency:       ${minLatency} ms`);
  console.log(`Max Latency:       ${maxLatency} ms`);
  console.log(`Total Requests:    ${completed}`);
  console.log(`Errors:            ${errors} (${errorRate}%)`);
  console.log(`Status Codes:     `, JSON.stringify(statusCodes));
  console.log(`========================================\n`);
}

run().catch(console.error);
