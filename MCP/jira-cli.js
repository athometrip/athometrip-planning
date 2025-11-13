#!/usr/bin/env node

const fs = require('fs');

/**
 * Jira Cloud helper CLI.
 *
 * Commands:
 *   projects                      - list projects
 *   issue --key KEY               - fetch issue details
 *   search --jql "..."            - search issues
 *   create --project KEY --type BUG --summary "..." [--description "..."] [--body-file file.json]
 *   transitions --key KEY         - list available transitions
 *   transition --key KEY --id ID  - perform a transition
 *   comment --key KEY --text "..." [--body-file file.json]
 */

const BASE_URL = process.env.JIRA_BASE_URL || 'https://athometrip.atlassian.net';
const email = process.env.ATLASSIAN_EMAIL;
const token = process.env.CONFLUENCE_API_TOKEN;

if (!email || !token) {
  console.error('Missing ATLASSIAN_EMAIL or CONFLUENCE_API_TOKEN in environment.');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
const args = process.argv.slice(2);
const command = args[0];

const allowedCommands = ['projects', 'issue', 'search', 'create', 'transitions', 'transition', 'comment'];
if (!command || !allowedCommands.includes(command)) {
  console.log('Usage: node jira-cli.js <projects|issue|search|create|transitions|transition|comment> [options]');
  process.exit(1);
}

function parseOptions(rawArgs) {
  const options = {};
  for (let i = 0; i < rawArgs.length; i += 2) {
    const key = rawArgs[i];
    if (!key?.startsWith('--')) continue;
    options[key.replace(/^--/, '')] = rawArgs[i + 1] ?? true;
  }
  return options;
}

async function jiraFetch(path, init = {}) {
  const headers = {
    Accept: 'application/json',
    Authorization: authHeader,
    ...(init.headers || {}),
  };

  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}/rest/api/3${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira request failed (${response.status}): ${text}`);
  }

  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return raw;
  }
}

const readJsonFile = (filePath) => {
  if (!filePath) {
    console.error('Missing file path option');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const buildADFParagraph = (text) => ({
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: text
        ? [
            {
              type: 'text',
              text,
            },
          ]
        : [],
    },
  ],
});

async function run() {
  const options = parseOptions(args.slice(1));

  switch (command) {
    case 'projects': {
      const startAt = Number(options.start || 0);
      const maxResults = Number(options.max || 50);
      const data = await jiraFetch(`/project/search?startAt=${startAt}&maxResults=${maxResults}`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'issue': {
      const key = options.key;
      if (!key) {
        console.error('issue command requires --key <ISSUE-KEY>');
        process.exit(1);
      }
      const fields = options.fields ? `?fields=${options.fields}` : '';
      const data = await jiraFetch(`/issue/${key}${fields}`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'search': {
      const jql = options.jql;
      if (!jql) {
        console.error('search command requires --jql "<JQL>"');
        process.exit(1);
      }
      const maxResults = Number(options.max || 50);

      const payload = options['body-file']
        ? readJsonFile(options['body-file'])
        : {
            jql,
            maxResults,
          };

      const data = await jiraFetch(`/search/jql${options.start ? `?startAt=${options.start}` : ''}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'create': {
      const body = options['body-file']
        ? readJsonFile(options['body-file'])
        : (() => {
            const projectKey = options.project;
            const summary = options.summary;
            const issueType = options.type;
            if (!projectKey || !summary || !issueType) {
              console.error('create command requires --project <KEY> --summary "<text>" --type <IssueType>');
              process.exit(1);
            }
            return {
              fields: {
                project: { key: projectKey },
                summary,
                issuetype: { name: issueType },
                description: buildADFParagraph(options.description || ''),
              },
            };
          })();

      const data = await jiraFetch('/issue', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'transitions': {
      const key = options.key;
      if (!key) {
        console.error('transitions command requires --key <ISSUE-KEY>');
        process.exit(1);
      }
      const data = await jiraFetch(`/issue/${key}/transitions`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'transition': {
      const key = options.key;
      const id = options.id;
      if (!key || !id) {
        console.error('transition command requires --key <ISSUE-KEY> --id <TRANSITION-ID>');
        process.exit(1);
      }
      const data = await jiraFetch(`/issue/${key}/transitions`, {
        method: 'POST',
        body: JSON.stringify({
          transition: { id },
        }),
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'comment': {
      const key = options.key;
      if (!key) {
        console.error('comment command requires --key <ISSUE-KEY>');
        process.exit(1);
      }
      const body = options['body-file']
        ? readJsonFile(options['body-file'])
        : {
            body: buildADFParagraph(options.text || ''),
          };
      const data = await jiraFetch(`/issue/${key}/comment`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
