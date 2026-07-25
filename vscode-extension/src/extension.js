'use strict';

const vscode = require('vscode');
const { analyzeDotenv, buildMaskRanges, DEFAULT_KEY_PATTERN } = require('./parser');

const DEFAULT_FILE_PATTERN = '(^|/)(\\.env($|\\.)|[^/]+\\.env($|\\.))';

/** @type {vscode.TextEditorDecorationType | undefined} */
let maskDecoration;
/** @type {vscode.StatusBarItem | undefined} */
let statusBar;
let maskingEnabled = true;
const revealedDocuments = new Set();
const revealedSecrets = new Map();
const analyses = new Map();
const refreshTimers = new Map();
let warnedInvalidKeyPattern = false;
let warnedInvalidFilePattern = false;

function activate(context) {
  maskDecoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('editor.background'),
    backgroundColor: new vscode.ThemeColor('editor.foldBackground'),
    border: '1px solid',
    borderColor: new vscode.ThemeColor('editorWidget.border'),
    borderRadius: '2px',
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBar.command = 'envShadow.toggleCurrentFile';
  context.subscriptions.push(maskDecoration, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('envShadow.toggleMasking', () => {
      maskingEnabled = !maskingEnabled;
      refreshAllVisibleEditors();
    }),
    vscode.commands.registerCommand('envShadow.toggleCurrentFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isTargetDocument(editor.document)) {
        return;
      }
      const key = editor.document.uri.toString();
      if (revealedDocuments.has(key)) {
        revealedDocuments.delete(key);
      } else {
        revealedDocuments.add(key);
      }
      refreshEditor(editor);
    }),
    vscode.commands.registerCommand('envShadow.toggleSecretAtCursor', () => {
      toggleSecretAtCursor();
    }),
    vscode.commands.registerCommand('envShadow.hideAll', () => {
      maskingEnabled = true;
      revealedDocuments.clear();
      revealedSecrets.clear();
      refreshAllVisibleEditors();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => refreshAllVisibleEditors()),
    vscode.window.onDidChangeVisibleTextEditors(() => refreshAllVisibleEditors()),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const key = event.document.uri.toString();
      revealedSecrets.delete(key);
      analyses.delete(key);
      scheduleRefresh(event.document);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      revealedDocuments.delete(key);
      revealedSecrets.delete(key);
      analyses.delete(key);
      const timer = refreshTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        refreshTimers.delete(key);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('envShadow')) {
        maskingEnabled = getSettings().enabled;
        warnedInvalidKeyPattern = false;
        warnedInvalidFilePattern = false;
        analyses.clear();
        refreshAllVisibleEditors();
      }
    }),
  );

  maskingEnabled = getSettings().enabled;
  refreshAllVisibleEditors();
}

function deactivate() {
  for (const timer of refreshTimers.values()) {
    clearTimeout(timer);
  }
  refreshTimers.clear();
}

function getSettings() {
  const config = vscode.workspace.getConfiguration('envShadow');
  return {
    enabled: config.get('enabled', true),
    autoDetect: config.get('autoDetect', true),
    keepStart: config.get('keepStart', 3),
    keepEnd: config.get('keepEnd', 3),
    labels: config.get('labels', ['secret', 'shadow', 'blur']),
    publicLabels: config.get('publicLabels', ['public', 'reveal', 'visible']),
    keyPattern: config.get('keyPattern', DEFAULT_KEY_PATTERN),
    filePattern: config.get('filePattern', DEFAULT_FILE_PATTERN),
  };
}

function compileFilePattern(pattern) {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    if (!warnedInvalidFilePattern) {
      warnedInvalidFilePattern = true;
      vscode.window.showWarningMessage(
        'Env Shadow: envShadow.filePattern is invalid; the default pattern is being used.',
      );
    }
    return new RegExp(DEFAULT_FILE_PATTERN, 'i');
  }
}

function isTargetDocument(document) {
  if (!document || ['output', 'debug', 'git'].includes(document.uri.scheme)) {
    return false;
  }
  const path = (document.uri.fsPath || document.uri.path || document.fileName).replace(/\\/g, '/');
  return compileFilePattern(getSettings().filePattern).test(path);
}

function scheduleRefresh(document) {
  const key = document.uri.toString();
  const existing = refreshTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }
  refreshTimers.set(
    key,
    setTimeout(() => {
      refreshTimers.delete(key);
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === key) {
          refreshEditor(editor);
        }
      }
    }, 80),
  );
}

function refreshAllVisibleEditors() {
  for (const editor of vscode.window.visibleTextEditors) {
    refreshEditor(editor);
  }
  updateStatusBar();
}

function refreshEditor(editor) {
  if (!maskDecoration) {
    return;
  }

  const document = editor.document;
  const documentKey = document.uri.toString();

  if (!maskingEnabled || revealedDocuments.has(documentKey) || !isTargetDocument(document)) {
    editor.setDecorations(maskDecoration, []);
    analyses.delete(documentKey);
    updateStatusBar();
    return;
  }

  const settings = getSettings();
  const analysis = analyzeDotenv(document.getText(), settings);
  analyses.set(documentKey, analysis);

  if (analysis.usedFallbackKeyPattern && !warnedInvalidKeyPattern) {
    warnedInvalidKeyPattern = true;
    vscode.window.showWarningMessage(
      'Env Shadow: envShadow.keyPattern is invalid; the default pattern is being used.',
    );
  }

  const revealed = revealedSecrets.get(documentKey) || new Set();
  const maskRanges = buildMaskRanges(document.getText(), analysis.secrets, settings).filter(
    (entry) => !revealed.has(secretId(entry.secret)),
  );

  const options = maskRanges.map((entry) => ({
    range: new vscode.Range(
      document.positionAt(entry.start),
      document.positionAt(entry.end),
    ),
    hoverMessage: new vscode.MarkdownString(
      `**Env Shadow** masked \`${entry.secret.key}\`. Run **Env Shadow: Toggle Secret Under Cursor** to reveal it.`,
    ),
  }));

  editor.setDecorations(maskDecoration, options);
  updateStatusBar();
}

function secretId(secret) {
  return `${secret.key}:${secret.start}:${secret.end}`;
}

function toggleSecretAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isTargetDocument(editor.document)) {
    return;
  }

  const document = editor.document;
  const key = document.uri.toString();
  let analysis = analyses.get(key);
  if (!analysis) {
    analysis = analyzeDotenv(document.getText(), getSettings());
    analyses.set(key, analysis);
  }

  const offset = document.offsetAt(editor.selection.active);
  const line = editor.selection.active.line;
  const secret = analysis.secrets.find(
    (candidate) =>
      (offset >= candidate.start && offset <= candidate.end) ||
      (line >= candidate.startLine && line <= candidate.endLine),
  );

  if (!secret) {
    vscode.window.showInformationMessage('Env Shadow: no masked secret under the cursor.');
    return;
  }

  const id = secretId(secret);
  const revealed = revealedSecrets.get(key) || new Set();
  if (revealed.has(id)) {
    revealed.delete(id);
  } else {
    revealed.add(id);
  }
  revealedSecrets.set(key, revealed);
  refreshEditor(editor);
}

function updateStatusBar() {
  if (!statusBar) {
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor || !isTargetDocument(editor.document)) {
    statusBar.hide();
    return;
  }

  const key = editor.document.uri.toString();
  if (!maskingEnabled) {
    statusBar.command = 'envShadow.toggleMasking';
    statusBar.text = '$(eye) Env Shadow: off';
    statusBar.tooltip = 'Secret masking is disabled. Run “Env Shadow: Toggle Masking” to enable it.';
  } else if (revealedDocuments.has(key)) {
    statusBar.command = 'envShadow.toggleCurrentFile';
    statusBar.text = '$(eye) Env Shadow: revealed';
    statusBar.tooltip = 'This file is revealed. Click to mask it again.';
  } else {
    statusBar.command = 'envShadow.toggleCurrentFile';
    statusBar.text = '$(eye-closed) Env Shadow';
    statusBar.tooltip = 'Secrets are visually masked. Click to reveal this file.';
  }
  statusBar.show();
}

module.exports = { activate, deactivate };
