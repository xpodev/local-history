// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as Diff from 'diff';
import * as path from 'path';
import { EOL } from 'os';
import { TextEncoder } from 'util';

const root_dir = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0].uri : parentFolder(vscode.workspace.textDocuments[0].uri);
const lh_dir = vscode.Uri.joinPath(root_dir, '.lh');
const lh_ignore_file = vscode.Uri.joinPath(lh_dir, '.lhignore');
const schema = `${root_dir.scheme}:`;
let lh_ignore: string[] = [];

const onSave = vscode.workspace.onWillSaveTextDocument(createDiff);

async function createDiff(document: vscode.TextDocumentWillSaveEvent): Promise<void> {
	const fullPath = document.document.uri;
	if (fullPath.path === lh_ignore_file.path) {
		await loadIgnoreFile();
	}
	if (isIgnored(fullPath)) {
		return;
	}
	const newData = document.document.getText();
	let fileDiff = await loadFileDiff(fullPath);
	if (fileDiff) {
		if (fileDiff.commits.length < 1) {
			newCommit(fileDiff, newData);
		} else {
			const diskData = fs.readFileSync(document.document.fileName).toString();
			if (newData !== diskData || newData !== fileDiff.commits[fileDiff.activeCommit - 1]) {
				const patch = Diff.createPatch('', diskData, newData !== diskData ? newData : fileDiff.commits[fileDiff.activeCommit - 1]);
				newPatch(fileDiff, patch);
			}
		}
	} else {
		fileDiff = {
			activeCommit: 1,
			activePatch: 0,
			commits: [newData],
			patches: []
		};
		createFile(diffPathOf(fullPath));
	}
	saveFileDiff(fullPath, fileDiff);
}

function newPatch(fileDiff: diff, data: string): void {
	if (fileDiff.activePatch < fileDiff.patches.length) {
		fileDiff.patches = fileDiff.patches.slice(0, fileDiff.activePatch);
	}
	fileDiff.patches.push(data);
	fileDiff.activePatch = fileDiff.patches.length;
}

function newCommit(fileDiff: diff, data: string): void {
	fileDiff.commits.push(data);
	fileDiff.activeCommit = fileDiff.commits.length;
	fileDiff.activePatch = 0;
	fileDiff.patches = [];
}

function diffPathOf(filePath: vscode.Uri): vscode.Uri {
	const relativeFilePath = vscode.workspace.asRelativePath(filePath);
	return vscode.Uri.joinPath(lh_dir, `${relativeFilePath}.json`);
}

async function loadFileDiff(filePath: vscode.Uri): Promise<diff | undefined> {
	const diffPath = diffPathOf(filePath);
	try {
		if (await fileExists(diffPath)) {
			return JSON.parse((await vscode.workspace.fs.readFile(diffPath)).toString());
		} else {
			return undefined;
		}
	} catch (err) {
		console.log(err);
	}
}

async function saveFileDiff(filePath: vscode.Uri, fileDiff: diff): Promise<void> {
	const diffPath = diffPathOf(filePath);
	await vscode.workspace.fs.writeFile(diffPath, encode(JSON.stringify(fileDiff, null, 4)));
}

async function loadIgnoreFile(): Promise<void> {
	lh_ignore = (await vscode.workspace.fs.readFile(lh_ignore_file)).toString().split(EOL).filter(Boolean);
}

function isIgnored(filePath: vscode.Uri): boolean {
	const a = lh_ignore.filter(function (pattern) {
		return new RegExp(pattern).test(vscode.workspace.asRelativePath(filePath));
	}).length > 0;
	return a;
}

async function restorePatch(): Promise<void> {
	// Display a message box to the user
	const filePath = vscode.window.activeTextEditor!.document.uri;
	let patchId: any = await vscode.window.showInputBox();
	patchId = parseInt(patchId);
	restorePatchA(filePath, patchId);
}

async function restorePatchA(filePath: vscode.Uri, patchId: number): Promise<void> {
	const fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		if (!patchId || patchId > fileDiff.patches.length) {
			patchId = fileDiff.patches.length;
		}
		let temp = fileDiff.commits[fileDiff.activeCommit - 1];
		for (let i = 0; i < patchId; i++) {
			const patchString = fileDiff.patches[i];
			const uniDiff = Diff.parsePatch(patchString);
			temp = Diff.applyPatch(temp, uniDiff[0]);
		}
		await vscode.workspace.fs.writeFile(filePath, (new TextEncoder()).encode(temp));
		fileDiff.activePatch = patchId;
		saveFileDiff(filePath, fileDiff);
	} else {
		vscode.window.showErrorMessage(`Diff info not found on file "${filePath}"`);
	}
}

async function restoreCommit(): Promise<void> {
	// Display a message box to the user
	const filePath = vscode.window.activeTextEditor!.document.uri;
	let commitId: any = await vscode.window.showInputBox();
	commitId = parseInt(commitId);
	restoreCommitA(filePath, commitId);
}

async function restoreCommitA(filePath: vscode.Uri, commitId: number): Promise<void> {
	const fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		if (!commitId || commitId > fileDiff.commits.length) {
			commitId = fileDiff.commits.length;
		}
		await vscode.workspace.fs.writeFile(filePath, (new TextEncoder()).encode(fileDiff.commits[commitId]));
		fileDiff.activeCommit = commitId;
		saveFileDiff(filePath, fileDiff);
	} else {
		vscode.window.showErrorMessage(`Diff info not found on file "${filePath}"`);
	}
}

async function createCommit() {
	const filePath = vscode.window.activeTextEditor!.document.uri;
	const newData = vscode.window.activeTextEditor!.document.getText();
	let fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		newCommit(fileDiff, newData);
		saveFileDiff(filePath, fileDiff);
	} else {
		createDiffFile(filePath, newData);
	}
}

function createDiffFile(filePath: vscode.Uri, initCommit: string) {
	const fileDiff = {
		activeCommit: 1,
		activePatch: 0,
		commits: [initCommit],
		patches: []
	};
	createFile(diffPathOf(filePath), JSON.stringify(fileDiff, null, 4));
}

async function init(): Promise<void> {
	if (await fileExists(lh_ignore_file)) {
		return;
	} else {
		if (!(await fileExists(lh_dir))) {
			await vscode.workspace.fs.createDirectory(lh_dir);
		}
		await vscode.workspace.fs.writeFile(lh_ignore_file, encode(`.lh/*${EOL}`));
	}
}

async function createFile(filePath: vscode.Uri, data?: string | undefined) {
	if (await fileExists(filePath)) {
		return;
	}
	await vscode.workspace.fs.createDirectory(parentFolder(filePath));
	await vscode.workspace.fs.writeFile(filePath, encode(data));
}

async function fileExists(fileUri: vscode.Uri): Promise<boolean> {
	try {
		const f = await vscode.workspace.fs.stat(fileUri);
		return true;
	} catch (err) {
		return false;
	}
}

function parentFolder(uriPath: vscode.Uri): vscode.Uri {
	return vscode.Uri.joinPath(uriPath, '..');
}

function encode(str: string | undefined): Uint8Array {
	return (new TextEncoder()).encode(str);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "local-history" is now active!');
	await init();
	await loadIgnoreFile();
	let restorePatchCmd = vscode.commands.registerCommand('local-history.restore-patch', restorePatch);
	let restoreCommitCmd = vscode.commands.registerCommand('local-history.restore-commit', restoreCommit);
	let createCommitCmd = vscode.commands.registerCommand('local-history.create-commit', createCommit);
	context.subscriptions.push(createCommitCmd, restorePatchCmd, restoreCommitCmd);
	context.subscriptions.push(onSave);
}

// this method is called when your extension is deactivated
export function deactivate() { }

type diff = {
	activeCommit: number,
	activePatch: number,
	commits: string[],
	patches: string[]
}
