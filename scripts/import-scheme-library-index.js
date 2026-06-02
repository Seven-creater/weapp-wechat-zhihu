#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_INPUT = path.join('tmp', 'scheme-library-index.json');
const DEFAULT_COLLECTION = 'scheme_library';

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = path.resolve(args.input || DEFAULT_INPUT);
  const collection = args.collection || DEFAULT_COLLECTION;
  const envId = args.env || '';
  const execute = args.execute === true;

  if (!envId) {
    throw new Error('Missing --env');
  }
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Index file not found: ${inputFile}`);
  }

  const records = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  if (!Array.isArray(records)) {
    throw new Error('Index file must contain a JSON array');
  }

  console.log(`${execute ? 'Importing' : 'Dry run'} ${records.length} scheme records into ${collection}`);
  records.forEach((record) => {
    const schemeCode = String(record && (record.schemeCode || record.code) || '').trim();
    if (!schemeCode) {
      throw new Error('Invalid record without schemeCode');
    }

    const command = buildUpdateCommand(collection, schemeCode, record);
    if (!execute) {
      console.log(`upsert ${schemeCode}`);
      return;
    }

    const invocation = buildTcbInvocation([
      'db',
      'nosql',
      'execute',
      '--command',
      JSON.stringify(command),
      '-e',
      envId
    ]);
    const result = spawnSync(invocation.command, invocation.args, { stdio: 'inherit' });

    if (result.status !== 0) {
      throw new Error(`Import failed: ${schemeCode}`);
    }
  });
}

function buildTcbInvocation(args) {
  const explicitBin = process.env.TCB_CLI_BIN;
  const bundledBin = path.join(os.tmpdir(), 'codex-cloudbase-cli', 'node_modules', '@cloudbase', 'cli', 'bin', 'tcb');
  if (explicitBin || fs.existsSync(bundledBin)) {
    return {
      command: process.execPath,
      args: [explicitBin || bundledBin].concat(args)
    };
  }

  return {
    command: process.platform === 'win32' ? 'tcb.cmd' : 'tcb',
    args
  };
}

function buildUpdateCommand(collection, schemeCode, record) {
  const normalized = Object.assign({}, compactRecord(record), {
    schemeCode,
    code: schemeCode,
    importedAt: new Date().toISOString()
  });

  return [{
    TableName: collection,
    CommandType: 'UPDATE',
    Command: JSON.stringify({
      update: collection,
      updates: [{
        q: { schemeCode },
        u: { $set: normalized },
        upsert: true,
        multi: false
      }]
    })
  }];
}

function compactRecord(record) {
  const displaySections = compactDisplaySections(record.displaySections || {});
  return {
    schemeCode: record.schemeCode,
    code: record.code || record.schemeCode,
    schemePrefix: record.schemePrefix,
    title: record.title,
    facilityRoot: record.facilityRoot,
    facilityGroups: record.facilityGroups || [],
    matchedCategories: record.matchedCategories || [],
    matchedSubtypes: record.matchedSubtypes || [],
    schemeSummary: record.schemeSummary || (displaySections && displaySections.tagSummary) || {},
    displaySections,
    resourceStatus: record.resourceStatus,
    sortOrder: record.sortOrder,
    storagePrefix: record.storagePrefix,
    sourceFolder: record.sourceFolder,
    files: [],
    fileGroups: [],
    previewFiles: [],
    packageFiles: [],
    totalFileCount: record.totalFileCount || 0,
    previewFileCount: record.previewFileCount || 0,
    engineeringFileCount: record.engineeringFileCount || 0,
    totalSize: record.totalSize || 0,
    updatedAt: record.updatedAt
  };
}

function compactDisplaySections(sections) {
  return {
    drawingFiles: compactFiles(sections.drawingFiles),
    tagCardFiles: compactFiles(sections.tagCardFiles),
    materialTableFiles: compactFiles(sections.materialTableFiles),
    constructionFiles: compactFiles(sections.constructionFiles),
    tagSummary: sections.tagSummary || {}
  };
}

function compactFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.map((file) => ({
    name: file.name,
    ext: file.ext,
    cloudPath: file.cloudPath,
    fileID: file.fileID,
    schemeRelativePath: file.schemeRelativePath,
    groupName: file.groupName,
    fileType: file.fileType,
    previewable: file.previewable === true,
    packageFile: file.packageFile === true
  }));
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (item === '--execute') {
      parsed.execute = true;
    } else if (item === '--input') {
      parsed.input = args[i + 1];
      i += 1;
    } else if (item === '--collection') {
      parsed.collection = args[i + 1];
      i += 1;
    } else if (item === '--env') {
      parsed.env = args[i + 1];
      i += 1;
    }
  }
  return parsed;
}
