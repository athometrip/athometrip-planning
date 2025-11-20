#!/usr/bin/env node

const fs = require('fs');

/**
 * Convert Markdown to Atlassian Document Format (ADF) JSON
 */

function markdownToADF(markdown) {
  const lines = markdown.split('\n');
  const content = [];
  let currentList = null;
  let inCodeBlock = false;
  let codeBlockContent = [];
  let codeBlockLang = '';
  let inTable = false;
  let tableLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table detection
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(line);
      continue;
    } else if (inTable) {
      // End of table
      inTable = false;
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      const table = parseTable(tableLines);
      if (table) {
        content.push(table);
      }
      tableLines = [];
      // Don't continue - process this line normally
    }

    // Code block handling
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim() || 'text';
        codeBlockContent = [];
      } else {
        // End code block
        inCodeBlock = false;
        content.push({
          type: 'codeBlock',
          attrs: {
            language: codeBlockLang,
          },
          content: [
            {
              type: 'text',
              text: codeBlockContent.join('\n'),
            },
          ],
        });
        codeBlockContent = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      content.push({
        type: 'heading',
        attrs: { level: 1 },
        content: parseInlineContent(line.slice(2)),
      });
      continue;
    }

    if (line.startsWith('## ')) {
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: parseInlineContent(line.slice(3)),
      });
      continue;
    }

    if (line.startsWith('### ')) {
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: parseInlineContent(line.slice(4)),
      });
      continue;
    }

    if (line.startsWith('#### ')) {
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      content.push({
        type: 'heading',
        attrs: { level: 4 },
        content: parseInlineContent(line.slice(5)),
      });
      continue;
    }

    // Horizontal rule
    if (line.trim() === '---') {
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      content.push({
        type: 'rule',
      });
      continue;
    }

    // List items
    if (line.startsWith('- ')) {
      if (!currentList) {
        currentList = {
          type: 'bulletList',
          content: [],
        };
      }
      currentList.content.push({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: parseInlineContent(line.slice(2)),
          },
        ],
      });
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      if (currentList) {
        content.push(currentList);
        currentList = null;
      }
      continue;
    }

    // Regular paragraph
    if (currentList) {
      content.push(currentList);
      currentList = null;
    }

    const paragraphContent = parseInlineContent(line);
    if (paragraphContent.length > 0) {
      content.push({
        type: 'paragraph',
        content: paragraphContent,
      });
    }
  }

  // Add any remaining list
  if (currentList) {
    content.push(currentList);
  }

  // Add any remaining table
  if (inTable && tableLines.length > 0) {
    const table = parseTable(tableLines);
    if (table) {
      content.push(table);
    }
  }

  return {
    version: 1,
    type: 'doc',
    content: content,
  };
}

function parseTable(tableLines) {
  if (tableLines.length < 2) return null;

  // Filter out separator line (contains only |, -, and whitespace)
  const dataLines = tableLines.filter(line => !line.match(/^\s*\|[\s\-:|]+\|\s*$/));

  if (dataLines.length === 0) return null;

  const rows = dataLines.map(line => {
    // Split by | and remove empty first/last elements
    return line.split('|')
      .map(cell => cell.trim())
      .filter((cell, idx, arr) => idx !== 0 && idx !== arr.length - 1);
  });

  if (rows.length === 0 || rows[0].length === 0) return null;

  const tableContent = [];

  // First row is header
  const headerCells = rows[0].map(cellText => ({
    type: 'tableHeader',
    attrs: {},
    content: [
      {
        type: 'paragraph',
        content: parseInlineContent(cellText),
      },
    ],
  }));

  tableContent.push({
    type: 'tableRow',
    content: headerCells,
  });

  // Remaining rows are data
  for (let i = 1; i < rows.length; i++) {
    const dataCells = rows[i].map(cellText => ({
      type: 'tableCell',
      attrs: {},
      content: [
        {
          type: 'paragraph',
          content: parseInlineContent(cellText),
        },
      ],
    }));

    tableContent.push({
      type: 'tableRow',
      content: dataCells,
    });
  }

  return {
    type: 'table',
    attrs: {
      isNumberColumnEnabled: false,
      layout: 'default',
    },
    content: tableContent,
  };
}

function parseInlineContent(text) {
  const content = [];
  let currentText = '';
  let i = 0;

  while (i < text.length) {
    // Handle <br> tags
    if (text.slice(i, i + 4) === '<br>' || text.slice(i, i + 5) === '<br/>') {
      if (currentText) {
        content.push({ type: 'text', text: currentText });
        currentText = '';
      }
      content.push({
        type: 'hardBreak',
      });
      i += text.slice(i, i + 5) === '<br/>' ? 5 : 4;
      continue;
    }

    // Bold text
    if (text.slice(i, i + 2) === '**') {
      if (currentText) {
        content.push({ type: 'text', text: currentText });
        currentText = '';
      }
      i += 2;
      let boldText = '';
      while (i < text.length && text.slice(i, i + 2) !== '**') {
        boldText += text[i];
        i++;
      }
      if (boldText) {
        content.push({
          type: 'text',
          text: boldText,
          marks: [{ type: 'strong' }],
        });
      }
      i += 2;
      continue;
    }

    // Inline code
    if (text[i] === '`') {
      if (currentText) {
        content.push({ type: 'text', text: currentText });
        currentText = '';
      }
      i++;
      let codeText = '';
      while (i < text.length && text[i] !== '`') {
        codeText += text[i];
        i++;
      }
      if (codeText) {
        content.push({
          type: 'text',
          text: codeText,
          marks: [{ type: 'code' }],
        });
      }
      i++;
      continue;
    }

    currentText += text[i];
    i++;
  }

  if (currentText) {
    content.push({ type: 'text', text: currentText });
  }

  return content;
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node markdown-to-adf.js <input.md> [output.json]');
  process.exit(1);
}

const inputFile = args[0];
const outputFile = args[1];

const markdown = fs.readFileSync(inputFile, 'utf-8');
const adf = markdownToADF(markdown);
const adfJson = JSON.stringify(adf, null, 2);

if (outputFile) {
  fs.writeFileSync(outputFile, adfJson);
  console.log(`ADF JSON written to ${outputFile}`);
} else {
  console.log(adfJson);
}
