#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_LIBRARY_DIR = 'C:\\Users\\29785\\Desktop\\无障碍改造方案库';
const DEFAULT_CLOUD_PREFIX = 'scheme-library';

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const libraryDir = path.resolve(args.libraryDir || DEFAULT_LIBRARY_DIR);
  const cloudPrefix = normalizeCloudPath(args.cloudPrefix || DEFAULT_CLOUD_PREFIX);
  const execute = args.execute === true;
  const times = args.times || '3';
  const envId = args.env || '';

  if (!fs.existsSync(libraryDir)) {
    throw new Error(`方案库目录不存在: ${libraryDir}`);
  }

  const schemeDirs = findSchemeDirs(libraryDir);
  console.log(`${execute ? 'Uploading' : 'Dry run'} ${schemeDirs.length} scheme folders`);

  schemeDirs.forEach((schemeDir) => {
    const schemeCode = parseSchemeCode(path.basename(schemeDir));
    const cloudPath = `${cloudPrefix}/${schemeCode}`;
    const command = ['tcb', 'storage', 'upload', schemeDir, cloudPath, '--times', times];
    if (envId) {
      command.push('-e', envId);
    }

    if (!execute) {
      console.log(command.map(quoteArg).join(' '));
      return;
    }

    const result = spawnSync(command[0], command.slice(1), {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    if (result.status !== 0) {
      throw new Error(`上传失败: ${schemeCode}`);
    }
  });
}

function findSchemeDirs(rootDir) {
  const result = [];
  fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((facilityEntry) => {
      const facilityDir = path.join(rootDir, facilityEntry.name);
      fs.readdirSync(facilityDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .forEach((schemeEntry) => {
          const schemeDir = path.join(facilityDir, schemeEntry.name);
          if (parseSchemeCode(schemeEntry.name)) {
            result.push(schemeDir);
          }
        });
    });
  return result.sort((a, b) => parseSchemeCode(path.basename(a)).localeCompare(parseSchemeCode(path.basename(b))));
}

function parseSchemeCode(name) {
  const match = String(name || '').match(/^([A-Z]-\d+(?:[.-]\d+)?)/);
  return match ? match[1].replace(/-(\d)-(\d)/, '-$1.$2') : '';
}

function normalizeCloudPath(value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '') || DEFAULT_CLOUD_PREFIX;
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (item === '--execute') {
      parsed.execute = true;
    } else if (item === '--cloud-prefix') {
      parsed.cloudPrefix = args[i + 1];
      i += 1;
    } else if (item === '--times') {
      parsed.times = args[i + 1];
      i += 1;
    } else if (item === '--env') {
      parsed.env = args[i + 1];
      i += 1;
    } else if (!parsed.libraryDir) {
      parsed.libraryDir = item;
    }
  }
  return parsed;
}

function quoteArg(value) {
  const text = String(value);
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}
