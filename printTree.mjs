// printTree.mjs
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EXCLUDE = new Set(['node_modules', 'dist', '.git', '.next', '.vercel']);

function printTree(dir, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !EXCLUDE.has(e.name))
    .sort((a, b) => {
      // folders first
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  entries.forEach((entry, idx) => {
    const isLast = idx === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    console.log(prefix + connector + entry.name);

    if (entry.isDirectory()) {
      const ext = isLast ? '    ' : '│   ';
      printTree(path.join(dir, entry.name), prefix + ext);
    }
  });
}

console.log(path.basename(ROOT));
printTree(ROOT);