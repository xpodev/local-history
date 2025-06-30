import * as vscode from 'vscode';

let _localHistoryDirectory = vscode.workspace.getConfiguration('local-history').get<string>('localHistoryPath') || '.lh';
vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration('local-history.localHistoryPath')) {
        _localHistoryDirectory = vscode.workspace.getConfiguration('local-history').get<string>('localHistoryPath') || '.lh';
    }
});

let _maxPatches = vscode.workspace.getConfiguration('local-history').get<number>('maxPatches') || 100;
vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration('local-history.maxPatches')) {
        _maxPatches = vscode.workspace.getConfiguration('local-history').get<number>('maxPatches') || 100;
    }
});

export function localHistoryDirectory() {
    return _localHistoryDirectory;
}

export function maxPatches() {
    return _maxPatches;
}

export function localHistoryIgnoreFile() {
    return `${localHistoryDirectory()}/.lhignore`;
}