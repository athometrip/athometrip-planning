#!/usr/bin/env node

const fs = require('fs');

/**
 * Simple Confluence Cloud CLI helper.
 *
 * Usage examples:
 *   node confluence-cli.js space
 *   node confluence-cli.js pages --space 56721899
 *   node confluence-cli.js page --id 56722173 --body
 */

const BASE_URL = process.env.CONFLUENCE_BASE_URL || 'https://athometrip.atlassian.net/wiki';
const SPACE_KEY = process.env.CONFLUENCE_SPACE_KEY || 'Product';
const SPACE_ID = process.env.CONFLUENCE_SPACE_ID || '56721899';
const email = process.env.ATLASSIAN_EMAIL;
const token = process.env.CONFLUENCE_API_TOKEN;

if (!email || !token) {
  console.error('Missing ATLASSIAN_EMAIL or CONFLUENCE_API_TOKEN in environment.');
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

const args = process.argv.slice(2);
const command = args[0];

const allowedCommands = ['space', 'pages', 'page', 'delete', 'create', 'update'];

if (!command || !allowedCommands.includes(command)) {
  console.log('Usage: node confluence-cli.js <space|pages|page|delete> [options]');
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

async function confluenceFetch(path, init = {}) {
  const response = await fetch(`${BASE_URL}/api/v2${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: authHeader,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Confluence request failed (${response.status}): ${text}`);
  }

  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    return raw;
  }
}

async function run() {
  const options = parseOptions(args.slice(1));

  const readBodyValue = (filePath) => {
    if (!filePath) {
      console.error('Body file path is required');
      process.exit(1);
    }
    return fs.readFileSync(filePath, 'utf-8').trim();
  };

  switch (command) {
    case 'space': {
      const spaceKey = options.key || SPACE_KEY;
      const data = await confluenceFetch(`/spaces?keys=${spaceKey}&expand=homepage`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'create': {
      const title = options.title;
      const spaceId = options.space || SPACE_ID;
      const parentId = options.parent;
      const bodyValue = readBodyValue(options['body-file']);

      if (!title) {
        console.error('create command requires --title <title>');
        process.exit(1);
      }

      const payload = {
        spaceId,
        title,
        body: {
          atlas_doc_format: {
            value: bodyValue,
            representation: 'atlas_doc_format',
          },
        },
      };

      if (parentId) {
        payload.parentId = parentId;
      }

      const data = await confluenceFetch('/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'update': {
      const pageId = options.id;
      if (!pageId) {
        console.error('update command requires --id <pageId>');
        process.exit(1);
      }

      const includeParams = '?body-format=atlas_doc_format&include=version';
      const existing = await confluenceFetch(`/pages/${pageId}${includeParams}`);
      const nextVersion = (existing.version?.number || 0) + 1;

      const bodyValue = options['body-file']
        ? readBodyValue(options['body-file'])
        : existing.body?.atlas_doc_format?.value;

      if (!bodyValue) {
        console.error('Unable to determine body content. Provide --body-file or ensure page has existing body.');
        process.exit(1);
      }

      const payload = {
        id: pageId,
        status: options.status || existing.status,
        spaceId: options.space || existing.spaceId,
        parentId: options.parent || existing.parentId,
        title: options.title || existing.title,
        version: {
          number: nextVersion,
        },
        body: {
          atlas_doc_format: {
            value: bodyValue,
            representation: 'atlas_doc_format',
          },
        },
      };

      const data = await confluenceFetch(`/pages/${pageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'pages': {
      const spaceId = options.space || SPACE_ID;
      const limit = options.limit || 25;
      const data = await confluenceFetch(`/spaces/${spaceId}/pages?limit=${limit}`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'page': {
      const pageId = options.id;
      if (!pageId) {
        console.error('page command requires --id <pageId>');
        process.exit(1);
      }
      const includeBody = options.body;
      const format = includeBody ? '?body-format=atlas_doc_format&include=history' : '';
      const data = await confluenceFetch(`/pages/${pageId}${format}`);
      if (!includeBody && data.body) {
        delete data.body;
      }
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'delete': {
      const pageId = options.id;
      if (!pageId) {
        console.error('delete command requires --id <pageId>');
        process.exit(1);
      }
      await confluenceFetch(`/pages/${pageId}`, { method: 'DELETE' });
      console.log(`Deleted page ${pageId}`);
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
