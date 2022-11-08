import * as vscode from 'vscode';

let _localHistoryDirectory = vscode.workspace.getConfiguration('local-history').get<string>('localHistoryPath') || '.lh';
vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (e.affectsConfiguration('local-history.localHistoryPath')) {
        _localHistoryDirectory = vscode.workspace.getConfiguration('local-history').get<string>('localHistoryPath') || '.lh';
    }
});

export function localHistoryDirectory() {
    return _localHistoryDirectory;
}

export function localHistoryIgnoreFile() {
    return `${localHistoryDirectory()}/.lhignore`;
}