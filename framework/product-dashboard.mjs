#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const envPath = path.join(repoRoot, '.env');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    if (!line || line.trim().startsWith('#')) continue;
    const [key, ...rest] = line.split('=');
    if (key) env[key.trim()] = rest.join('=').trim();
  }
  return env;
}

const env = { ...loadEnv(envPath), ...process.env };
const ATLASSIAN_EMAIL = env.ATLASSIAN_EMAIL;
const ATLASSIAN_TOKEN = env.CONFLUENCE_API_TOKEN;
const FIGMA_TOKEN = env.FIGMA_PERSONAL_ACCESS_TOKEN;

if (!ATLASSIAN_EMAIL || !ATLASSIAN_TOKEN) {
  console.error('Missing ATLASSIAN_EMAIL / CONFLUENCE_API_TOKEN in .env');
  process.exit(1);
}
if (!FIGMA_TOKEN) {
  console.error('Missing FIGMA_PERSONAL_ACCESS_TOKEN in .env');
  process.exit(1);
}

const CASE_MAP = {
  'PRD-874': {
    confluenceId: '83034879',
    figmaFileKey: 'PuaTrGTcY3Q5OU7UFClAOo',
    figmaNodeId: '337:158',
    gitRepo: 'athometrip-front',
    gitCommit: '476357abd2aa2f765503191e96ad2cf9b0b15652'
  },
  'PRD-868': {
    confluenceId: '66650118',
    figmaFileKey: 'PuaTrGTcY3Q5OU7UFClAOo',
    figmaNodeId: '341:3909',
    gitRepo: 'athometrip-springboot',
    gitCommit: 'd6a06490'
  }
};

const jiraBase = 'https://athometrip.atlassian.net';
const confBase = `${jiraBase}/wiki`;
const authHeader = `Basic ${Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_TOKEN}`).toString('base64')}`;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: authHeader,
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchIssues() {
  const body = {
    jql: 'project = PRODUCT ORDER BY updated DESC',
    maxResults: 5,
    fields: ['summary', 'status', 'assignee', 'updated']
  };
  return fetchJson(`${jiraBase}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function fetchConfluenceTitle(pageId) {
  if (!pageId) return null;
  const data = await fetchJson(`${confBase}/api/v2/pages/${pageId}`);
  return `${data.title} (${confBase}${data._links.webui})`;
}

async function fetchIssueByKey(key) {
  const data = await fetchJson(`${jiraBase}/rest/api/3/issue/${key}?fields=summary,status,assignee,updated`);
  return { key: data.key, fields: data.fields };
}

function fetchGitStat(repoName, commit) {
  if (!repoName || !commit) return null;
  try {
    const repoPath = path.join(repoRoot, repoName);
    return execSync(`cd "${repoPath}" && git show -n 1 ${commit} --stat --oneline`, { encoding: 'utf-8' }).trim();
  } catch (err) {
    return `Failed to read git stats: ${err.message}`;
  }
}

function buildFigmaLink(fileKey, nodeId) {
  if (!fileKey || !nodeId) return null;
  return `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(nodeId)}`;
}

function renderSection(issue, extras) {
  const { key, fields } = issue;
  const lines = [];
  lines.push(`### ${key} · ${fields.summary}`);
  lines.push(`- 상태: **${fields.status.name}** · 담당: ${fields.assignee?.displayName || '-'} · 업데이트: ${fields.updated}`);
  if (extras.confluence) lines.push(`- Confluence: ${extras.confluence}`);
  if (extras.git) lines.push(`- Git:\n  \`\`\`\n  ${extras.git.replace(/\n/g, '\n  ')}\n  \`\`\``);
  if (extras.figma) lines.push(`- Figma: ${extras.figma}`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const keyArg = process.argv
    .slice(2)
    .find((arg) => /^[A-Za-z]+-\d+$/i.test(arg));

  let issues = [];
  if (keyArg) {
    issues = [await fetchIssueByKey(keyArg.toUpperCase())];
  } else {
    const issueResp = await fetchIssues();
    issues = issueResp.issues || [];
  }

  console.log('\n## Product Sprint Snapshot\n');
  for (const issue of issues) {
    const map = CASE_MAP[issue.key] || {};
    const [confTitle, gitStat] = await Promise.all([
      map.confluenceId ? fetchConfluenceTitle(map.confluenceId) : Promise.resolve(null),
      map.gitRepo && map.gitCommit ? Promise.resolve(fetchGitStat(map.gitRepo, map.gitCommit)) : Promise.resolve(null)
    ]);
    const figmaLink = buildFigmaLink(map.figmaFileKey, map.figmaNodeId);
    process.stdout.write(renderSection(issue, { confluence: confTitle, git: gitStat, figma: figmaLink }));
  }
  console.log('> Copy this block into `전체 미팅 메모_YYMMDD` or Product weekly update.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
