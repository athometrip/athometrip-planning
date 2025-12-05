#!/usr/bin/env node

/**
 * MCP 기반 주간/월간 개발 리포트 자동 생성기
 *
 * Usage:
 *   node report/generate-report.js --month 2025-11
 *   node report/generate-report.js --week 2025-W49
 *   node report/generate-report.js --from 2025-11-01 --to 2025-11-30
 *
 * Options:
 *   --month YYYY-MM      월간 리포트 (해당 월 전체)
 *   --week YYYY-Www      주간 리포트 (ISO week)
 *   --from YYYY-MM-DD    시작일
 *   --to YYYY-MM-DD      종료일
 *   --output FILE        출력 파일명 (기본: report/YYYY-MM-dev-report.json)
 *   --upload             Confluence에 자동 업로드
 *   --parent-id ID       Confluence 부모 페이지 ID (기본: 56722173)
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE_DIR = path.join(__dirname, '..');
const CONFLUENCE_BASE_URL = 'https://athometrip.atlassian.net/wiki';
const JIRA_BASE_URL = 'https://athometrip.atlassian.net';
const FIGMA_FILE_KEY = 'PuaTrGTcY3Q5OU7UFClAOo';

// Auth headers
const atlassianAuth = `Basic ${Buffer.from(`${process.env.ATLASSIAN_EMAIL}:${process.env.CONFLUENCE_API_TOKEN}`).toString('base64')}`;
const figmaAuth = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace('--', '');
      options[key] = args[i + 1] || true;
      i++;
    }
  }

  return options;
}

// Calculate date range
function getDateRange(options) {
  let fromDate, toDate;

  if (options.month) {
    const [year, month] = options.month.split('-');
    fromDate = new Date(year, month - 1, 1);
    toDate = new Date(year, month, 0);
  } else if (options.week) {
    // ISO week format: YYYY-Www
    const match = options.week.match(/(\d{4})-W(\d{2})/);
    if (match) {
      const [, year, week] = match;
      fromDate = getDateOfISOWeek(parseInt(week), parseInt(year));
      toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + 6);
    }
  } else if (options.from && options.to) {
    fromDate = new Date(options.from);
    toDate = new Date(options.to);
  } else {
    // Default: current month
    const now = new Date();
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  return {
    from: fromDate.toISOString().split('T')[0],
    to: toDate.toISOString().split('T')[0],
    label: options.month || options.week || `${fromDate.toISOString().split('T')[0]} ~ ${toDate.toISOString().split('T')[0]}`
  };
}

function getDateOfISOWeek(week, year) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  return ISOweekStart;
}

// Fetch Jira issues
async function fetchJiraIssues(dateRange) {
  const jql = `project = PRODUCT AND updated >= ${dateRange.from} AND updated <= ${dateRange.to} ORDER BY updated DESC`;

  const response = await fetch(`${JIRA_BASE_URL}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': atlassianAuth
    },
    body: JSON.stringify({
      jql,
      maxResults: 100,
      fields: ['key', 'summary', 'status', 'assignee', 'created', 'updated', 'issuetype', 'labels']
    })
  });

  const data = await response.json();
  return data.issues || [];
}

// Fetch GitHub commits
async function fetchGitCommits(dateRange, repoPath) {
  const { execSync } = require('child_process');

  try {
    const cmd = `git log --all --since="${dateRange.from}" --until="${dateRange.to}" --pretty=format:"%h|%ad|%s|%an" --date=short`;
    const output = execSync(cmd, { cwd: repoPath, encoding: 'utf-8' });

    return output.trim().split('\n').filter(Boolean).map(line => {
      const [hash, date, message, author] = line.split('|');
      return { hash, date, message, author };
    });
  } catch (e) {
    return [];
  }
}

// Fetch Figma file info
async function fetchFigmaInfo() {
  const response = await fetch(`https://api.figma.com/v1/files/${FIGMA_FILE_KEY}`, {
    headers: { 'X-Figma-Token': figmaAuth }
  });

  const data = await response.json();

  const canvases = data.document?.children || [];
  const statusCounts = { completed: 0, inProgress: 0, planned: 0, other: 0 };

  canvases.forEach(c => {
    const name = c.name;
    if (name.includes('완료') || name.includes('✅')) statusCounts.completed++;
    else if (name.includes('진행중') || name.includes('2️⃣') || name.includes('👀')) statusCounts.inProgress++;
    else if (name.includes('예정') || name.includes('3️⃣')) statusCounts.planned++;
    else statusCounts.other++;
  });

  return {
    name: data.name,
    lastModified: data.lastModified,
    canvasCount: canvases.length,
    statusCounts,
    progressRate: Math.round(((statusCounts.completed + statusCounts.inProgress) / canvases.length) * 100),
    canvases: canvases.map(c => ({ id: c.id, name: c.name }))
  };
}

// Categorize Jira issues
function categorizeIssues(issues) {
  const categories = {
    pickpass: [],
    mypage: [],
    partner: [],
    voucher: [],
    planning: [],
    other: []
  };

  issues.forEach(issue => {
    const summary = issue.fields.summary.toLowerCase();
    const labels = issue.fields.labels || [];

    if (summary.includes('픽패스') || summary.includes('pickpass')) {
      categories.pickpass.push(issue);
    } else if (summary.includes('마이페이지') || summary.includes('mypage') || summary.includes('회원')) {
      categories.mypage.push(issue);
    } else if (summary.includes('파트너') || summary.includes('partner')) {
      categories.partner.push(issue);
    } else if (summary.includes('바우처') || summary.includes('결제') || summary.includes('장바구니')) {
      categories.voucher.push(issue);
    } else if (summary.includes('기획') || summary.includes('디자인') || labels.includes('기획')) {
      categories.planning.push(issue);
    } else {
      categories.other.push(issue);
    }
  });

  return categories;
}

// Match commits with Jira keys
function matchCommitsWithJira(commits, issues) {
  const jiraKeys = issues.map(i => i.key);
  const matched = {};

  commits.forEach(commit => {
    const match = commit.message.match(/PRD-\d+/);
    if (match && jiraKeys.includes(match[0])) {
      if (!matched[match[0]]) matched[match[0]] = [];
      matched[match[0]].push(commit);
    }
  });

  return matched;
}

// Generate ADF document
function generateADF(data) {
  const { dateRange, jiraIssues, commits, figma, categories, commitMatches } = data;

  const totalCommits = commits.springboot.length + commits.front.length;
  const springbootPct = totalCommits > 0 ? ((commits.springboot.length / totalCommits) * 100).toFixed(1) : 0;
  const frontPct = totalCommits > 0 ? ((commits.front.length / totalCommits) * 100).toFixed(1) : 0;

  // Build category tables
  function buildCategoryTable(categoryName, issues, headers, getRowData) {
    if (issues.length === 0) return null;

    return {
      type: "table",
      attrs: { isNumberColumnEnabled: false, layout: "default" },
      content: [
        {
          type: "tableRow",
          content: headers.map(h => ({
            type: "tableHeader",
            content: [{ type: "paragraph", content: [{ type: "text", text: h }] }]
          }))
        },
        ...issues.map(issue => ({
          type: "tableRow",
          content: getRowData(issue).map(cell => ({
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: cell }] }]
          }))
        }))
      ]
    };
  }

  const doc = {
    version: 1,
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: `${dateRange.label} 개발 작업 현황` }]
      },
      {
        type: "panel",
        attrs: { panelType: "info" },
        content: [{
          type: "paragraph",
          content: [{ type: "text", text: `작성일: ${new Date().toISOString().split('T')[0]} | 데이터 수집 기간: ${dateRange.from} ~ ${dateRange.to}`, marks: [{ type: "strong" }] }]
        }]
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "데이터 수집 방법" }]
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "본 문서의 데이터는 MCP(Model Context Protocol) 도구를 통해 실시간으로 수집되었습니다." }]
      },
      {
        type: "table",
        attrs: { isNumberColumnEnabled: false, layout: "default" },
        content: [
          {
            type: "tableRow",
            content: ["데이터 소스", "API", "조회 조건", "수집 시점"].map(h => ({
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: h }] }]
            }))
          },
          {
            type: "tableRow",
            content: ["Jira", "Atlassian REST API v3", `project=PRODUCT AND updated>=${dateRange.from} AND updated<=${dateRange.to}`, new Date().toISOString().split('T')[0]].map(c => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
            }))
          },
          {
            type: "tableRow",
            content: ["GitHub", "git log (local)", `--since=${dateRange.from} --until=${dateRange.to}`, new Date().toISOString().split('T')[0]].map(c => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
            }))
          },
          {
            type: "tableRow",
            content: ["Figma", "Figma REST API v1", `file key: ${FIGMA_FILE_KEY}`, `${new Date().toISOString().split('T')[0]} (lastModified: ${figma.lastModified?.split('T')[0] || 'N/A'})`].map(c => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
            }))
          }
        ]
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "1. 정량적 성과" }]
      },
      {
        type: "table",
        attrs: { isNumberColumnEnabled: false, layout: "default" },
        content: [
          {
            type: "tableRow",
            content: ["항목", "수치", "산출 근거"].map(h => ({
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: h }] }]
            }))
          },
          {
            type: "tableRow",
            content: ["Jira 이슈", `${jiraIssues.length}건${jiraIssues.length >= 100 ? '+' : ''}`, "Jira API search/jql 결과"].map(c => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
            }))
          },
          {
            type: "tableRow",
            content: ["GitHub 커밋 (전체)", `${totalCommits}건`, "git log --all --oneline | wc -l"].map(c => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
            }))
          },
          {
            type: "tableRow",
            content: ["- athometrip-springboot", `${commits.springboot.length}건 (${springbootPct}%)`, "백엔드 레포지토리"].map(c => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
            }))
          },
          {
            type: "tableRow",
            content: ["- athometrip-front", `${commits.front.length}건 (${frontPct}%)`, "프론트엔드 레포지토리"].map(c => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
            }))
          },
          {
            type: "tableRow",
            content: ["Figma 진척률", `${figma.progressRate}% (${figma.statusCounts.completed + figma.statusCounts.inProgress}/${figma.canvasCount})`, `(완료 ${figma.statusCounts.completed}개 + 진행중 ${figma.statusCounts.inProgress}개) / 전체 ${figma.canvasCount}개 캔버스`].map(c => ({
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
            }))
          }
        ]
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "2. 주요 작업 카테고리" }]
      }
    ]
  };

  // Add category sections
  const categoryConfigs = [
    { key: 'pickpass', title: '[픽패스] Pickpass 서비스', headers: ['Jira', '작업 내용', '상태', 'GitHub Commit'] },
    { key: 'mypage', title: '[마이페이지] MyPage', headers: ['Jira', '작업 내용', '상태', 'GitHub Commit', 'Figma Node'] },
    { key: 'partner', title: '[파트너센터] PartnerCenter', headers: ['Jira', '작업 내용', '상태', 'GitHub Commit'] },
    { key: 'voucher', title: '[바우처/결제] Voucher/Payment', headers: ['Jira', '작업 내용', '상태', 'Figma Node'] }
  ];

  categoryConfigs.forEach(config => {
    const issues = categories[config.key];
    if (issues.length === 0) return;

    doc.content.push({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: config.title }]
    });

    const table = buildCategoryTable(
      config.key,
      issues,
      config.headers,
      (issue) => {
        const commits = commitMatches[issue.key] || [];
        const commitStr = commits.length > 0 ? `${commits[0].hash} (${commits[0].date})` : '-';
        const status = issue.fields.status?.name === '완료' ? '완료' : issue.fields.status?.name || '-';

        if (config.headers.includes('Figma Node')) {
          return [issue.key, issue.fields.summary, status, commitStr, '-'];
        }
        return [issue.key, issue.fields.summary, status, commitStr];
      }
    );

    if (table) doc.content.push(table);
  });

  // Add Figma section
  doc.content.push(
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "3. Figma 디자인 현황" }]
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "파일: ", marks: [{ type: "strong" }] },
        { type: "text", text: figma.name || '신규 통합기획문서' }
      ]
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "마지막 수정: ", marks: [{ type: "strong" }] },
        { type: "text", text: `${figma.lastModified || 'N/A'} (Figma API lastModified)` }
      ]
    },
    {
      type: "table",
      attrs: { isNumberColumnEnabled: false, layout: "default" },
      content: [
        {
          type: "tableRow",
          content: ["상태", "개수", "캔버스 목록"].map(h => ({
            type: "tableHeader",
            content: [{ type: "paragraph", content: [{ type: "text", text: h }] }]
          }))
        },
        {
          type: "tableRow",
          content: [`완료`, `${figma.statusCounts.completed}개`, figma.canvases.filter(c => c.name.includes('✅') || c.name.includes('완료')).map(c => c.name.replace(/[✅👀2️⃣3️⃣➡️⏸️]/g, '').trim()).join(', ') || '-'].map(c => ({
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
          }))
        },
        {
          type: "tableRow",
          content: [`진행중 (2단계)`, `${figma.statusCounts.inProgress}개`, figma.canvases.filter(c => c.name.includes('👀') || c.name.includes('2️⃣')).map(c => c.name.replace(/[✅👀2️⃣3️⃣➡️⏸️]/g, '').trim()).join(', ') || '-'].map(c => ({
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
          }))
        },
        {
          type: "tableRow",
          content: [`예정 (3단계)`, `${figma.statusCounts.planned}개`, figma.canvases.filter(c => c.name.includes('3️⃣')).map(c => c.name.replace(/[✅👀2️⃣3️⃣➡️⏸️]/g, '').trim()).join(', ') || '-'].map(c => ({
            type: "tableCell",
            content: [{ type: "paragraph", content: [{ type: "text", text: c }] }]
          }))
        }
      ]
    },
    {
      type: "panel",
      attrs: { panelType: "note" },
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "진척률 산출: ", marks: [{ type: "strong" }] },
          { type: "text", text: `(완료 ${figma.statusCounts.completed}개 + 진행중 ${figma.statusCounts.inProgress}개) / 전체 ${figma.canvasCount}개 = ${figma.progressRate}%. 캔버스 이름에 포함된 상태 표시 기호를 기준으로 분류함.` }
        ]
      }]
    }
  );

  return doc;
}

// Upload to Confluence
async function uploadToConfluence(adf, title, parentId = '56722173') {
  // Check if page exists
  const searchResponse = await fetch(`${CONFLUENCE_BASE_URL}/api/v2/pages?title=${encodeURIComponent(title)}&space-id=56721899`, {
    headers: { Accept: 'application/json', Authorization: atlassianAuth }
  });
  const searchData = await searchResponse.json();

  const existingPage = searchData.results?.find(p => p.title === title);

  if (existingPage) {
    // Update existing page
    const pageResponse = await fetch(`${CONFLUENCE_BASE_URL}/api/v2/pages/${existingPage.id}?body-format=atlas_doc_format&include=version`, {
      headers: { Accept: 'application/json', Authorization: atlassianAuth }
    });
    const pageData = await pageResponse.json();

    const updateResponse = await fetch(`${CONFLUENCE_BASE_URL}/api/v2/pages/${existingPage.id}`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: atlassianAuth },
      body: JSON.stringify({
        id: existingPage.id,
        status: 'current',
        title,
        body: { representation: 'atlas_doc_format', value: JSON.stringify(adf) },
        version: { number: (pageData.version?.number || 0) + 1 }
      })
    });

    const result = await updateResponse.json();
    return { action: 'updated', id: result.id, url: `${CONFLUENCE_BASE_URL}${result._links?.webui}` };
  } else {
    // Create new page
    const createResponse = await fetch(`${CONFLUENCE_BASE_URL}/api/v2/pages`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: atlassianAuth },
      body: JSON.stringify({
        spaceId: '56721899',
        status: 'current',
        title,
        parentId,
        body: { representation: 'atlas_doc_format', value: JSON.stringify(adf) }
      })
    });

    const result = await createResponse.json();
    return { action: 'created', id: result.id, url: `${CONFLUENCE_BASE_URL}${result._links?.webui}` };
  }
}

// Main function
async function main() {
  console.log('=== MCP 개발 리포트 생성기 ===\n');

  const options = parseArgs();
  const dateRange = getDateRange(options);

  console.log(`기간: ${dateRange.from} ~ ${dateRange.to}`);
  console.log('');

  // Fetch data
  console.log('[1/4] Jira 이슈 조회 중...');
  const jiraIssues = await fetchJiraIssues(dateRange);
  console.log(`  - ${jiraIssues.length}건 조회됨`);

  console.log('[2/4] GitHub 커밋 조회 중...');
  const springbootPath = path.join(BASE_DIR, '..', 'athometrip-springboot');
  const frontPath = path.join(BASE_DIR, '..', 'athometrip-front');

  const commits = {
    springboot: await fetchGitCommits(dateRange, springbootPath),
    front: await fetchGitCommits(dateRange, frontPath)
  };
  console.log(`  - springboot: ${commits.springboot.length}건`);
  console.log(`  - front: ${commits.front.length}건`);

  console.log('[3/4] Figma 정보 조회 중...');
  const figma = await fetchFigmaInfo();
  console.log(`  - 캔버스: ${figma.canvasCount}개, 진척률: ${figma.progressRate}%`);

  console.log('[4/4] 리포트 생성 중...');
  const categories = categorizeIssues(jiraIssues);
  const allCommits = [...commits.springboot, ...commits.front];
  const commitMatches = matchCommitsWithJira(allCommits, jiraIssues);

  const adf = generateADF({
    dateRange,
    jiraIssues,
    commits,
    figma,
    categories,
    commitMatches
  });

  // Save to file
  const outputFile = options.output || `report/${dateRange.from.substring(0, 7)}-dev-report.json`;
  const outputPath = path.join(BASE_DIR, outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(adf, null, 2));
  console.log(`\n리포트 저장됨: ${outputPath}`);

  // Upload to Confluence
  if (options.upload) {
    console.log('\nConfluence 업로드 중...');
    const title = `${dateRange.label} 개발 작업 현황`;
    const result = await uploadToConfluence(adf, title, options['parent-id'] || '56722173');
    console.log(`  - ${result.action}: ${result.url}`);
  }

  console.log('\n완료!');
}

main().catch(console.error);
