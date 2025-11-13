#!/usr/bin/env node

/**
 * Lightweight Figma API helper.
 *
 * Usage:
 *   node figma-cli.js file --key <fileKey>
 *   node figma-cli.js nodes --key <fileKey> --ids <nodeId,nodeId>
 *   node figma-cli.js images --key <fileKey> --ids <nodeId,nodeId>
 */

const BASE_URL = process.env.FIGMA_API_BASE_URL || 'https://api.figma.com/v1';
const token = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;

if (!token) {
  console.error('Missing FIGMA_PERSONAL_ACCESS_TOKEN in environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args[0];
const allowed = ['file', 'nodes', 'images'];

if (!command || !allowed.includes(command)) {
  console.log('Usage: node figma-cli.js <file|nodes|images> [options]');
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

async function figmaFetch(path, params = '') {
  const url = `${BASE_URL}${path}${params}`;
  const response = await fetch(url, {
    headers: {
      'X-Figma-Token': token,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Figma request failed (${response.status}): ${text}`);
    }
  return response.json();
}

async function run() {
  const options = parseOptions(args.slice(1));

  switch (command) {
    case 'file': {
      const key = options.key;
      if (!key) {
        console.error('file command requires --key <fileKey>');
        process.exit(1);
      }
      const data = await figmaFetch(`/files/${key}`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'nodes': {
      const key = options.key;
      const ids = options.ids;
      if (!key || !ids) {
        console.error('nodes command requires --key <fileKey> and --ids <nodeIds>');
        process.exit(1);
      }
      const data = await figmaFetch(`/files/${key}/nodes`, `?ids=${encodeURIComponent(ids)}`);
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'images': {
      const key = options.key;
      const ids = options.ids;
      if (!key || !ids) {
        console.error('images command requires --key <fileKey> and --ids <nodeIds>');
        process.exit(1);
      }
      const scale = options.scale || '1';
      const format = options.format || 'png';
      const params = new URLSearchParams({
        ids,
        scale,
        format,
      });
      const data = await figmaFetch(`/images/${key}`, `?${params.toString()}`);
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
