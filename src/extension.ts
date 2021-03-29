// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Diff from 'diff';
import * as utils from './utilities';
import { initGUI } from './gui';
import { EOL } from 'os';

export const root_dir = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0].uri : parentFolder(vscode.workspace.textDocuments[0].uri);
export const lh_dir = vscode.Uri.joinPath(root_dir, '.lh');
export const temp_dir = vscode.Uri.joinPath(lh_dir, '__temp__');
const lh_ignore_file = vscode.Uri.joinPath(lh_dir, '.lhignore');
let lh_ignore: string[] = [];



const config = {
	dateFormat: "dd-MM-yy"
}

const onSave = vscode.workspace.onWillSaveTextDocument(async (document) => {
	const diskData = (await vscode.workspace.fs.readFile(document.document.uri)).toString();
	await createDiff(document, diskData);
});

async function createDiff(document: vscode.TextDocumentWillSaveEvent, diskData: string): Promise<void> {
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
			const lastCommit = fileDiff.commits[fileDiff.activeCommit - 1].content;
			if (newData !== diskData || newData !== lastCommit) {
				const patch = Diff.createPatch('', newData !== diskData ? diskData : lastCommit, newData);
				newPatch(fileDiff, patch);
			}
		}
	} else {
		fileDiff = {
			activeCommit: 0,
			activePatch: 0,
			commits: [],
			patches: []
		};
		newCommit(fileDiff, newData);
		await createFile(diffPathOf(fullPath));
	}
	await saveFileDiff(fullPath, fileDiff!);
}

function newPatch(fileDiff: diff, data: string): void {
	if (fileDiff.activePatch < fileDiff.patches.length) {
		fileDiff.patches = fileDiff.patches.slice(0, fileDiff.activePatch);
	}
	const patchDate = new Date();
	const patch: patch = {
		date: utils.formatDate(patchDate, config.dateFormat),
		content: data
	}
	fileDiff.patches.push(patch);
	fileDiff.activePatch = fileDiff.patches.length;
}

function newCommit(fileDiff: diff, data: string | commit, name?: string): void {
	const commitDate = new Date();
	let createdCommit = {};
	if (typeof data == 'string') {
		createdCommit = {
			name: name ? name : `Commit${fileDiff ? fileDiff.commits.length : 1}-${utils.formatDate(commitDate, config.dateFormat)}`,
			date: commitDate.toLocaleString(),
			content: data
		}
	} else {
		createdCommit = data;
	}
	fileDiff.commits.push(createdCommit as commit);
	fileDiff.activeCommit = fileDiff.commits.length;
	fileDiff.activePatch = 0;
	fileDiff.patches = [];
}

function diffPathOf(filePath: vscode.Uri): vscode.Uri {
	const relativeFilePath = vscode.workspace.asRelativePath(filePath);
	return vscode.Uri.joinPath(lh_dir, `${relativeFilePath}.json`);
}

export function tempFileOf(filePath: vscode.Uri): vscode.Uri {
	return vscode.Uri.joinPath(temp_dir, `tmp-${vscode.workspace.asRelativePath(filePath)}`);
}
}

export async function loadFileDiff(filePath: vscode.Uri): Promise<diff | undefined> {
	const diffPath = diffPathOf(filePath);
	try {
		if (await fileExists(diffPath)) {
			return JSON.parse((await vscode.workspace.fs.readFile(diffPath)).toString());
		} else {
			return undefined;
		}
	} catch (err) {
		return undefined;
	}
}

async function saveFileDiff(filePath: vscode.Uri, fileDiff: diff): Promise<void> {
	const diffPath = diffPathOf(filePath);
	await vscode.workspace.fs.writeFile(diffPath, utils.encode(JSON.stringify(fileDiff, null, 4)));
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
	await restorePatchA(filePath, patchId);
}

export async function restorePatchA(filePath: vscode.Uri, patchId: number): Promise<void> {
	const fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		const patched = await getPatched(fileDiff, patchId);
		await vscode.workspace.fs.writeFile(filePath, (utils.encode(patched)));
		fileDiff!.activePatch = patchId;
		saveFileDiff(filePath, fileDiff!);
	}
}

export async function getPatched(fileDiff: diff, patchId: number): Promise<string | undefined> {
	if (fileDiff) {
		if (!patchId || patchId > fileDiff.patches.length) {
			patchId = fileDiff.patches.length;
		}
		if (patchId == 0) {
			return fileDiff.commits[fileDiff.activeCommit - 1].content;
		}
		let patched = fileDiff.commits[fileDiff.activeCommit - 1].content;
		for (let i = 0; i < patchId; i++) {
			const patchString = fileDiff.patches[i].content;
			const uniDiff = Diff.parsePatch(patchString);
			patched = Diff.applyPatch(patched, uniDiff[0]);
		}
		return patched;
	} else {
		return undefined;
	}
}

async function restoreCommit(): Promise<void> {
	// Display a message box to the user
	const filePath = vscode.window.activeTextEditor!.document.uri;
	let commitId: any = await vscode.window.showInputBox();
	commitId = parseInt(commitId);
	await restoreCommitA(filePath, commitId);
}

export async function restoreCommitA(filePath: vscode.Uri, commitId: number): Promise<void> {
	const fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		if (!commitId || commitId > fileDiff.commits.length) {
			commitId = fileDiff.commits.length;
		}
		await vscode.workspace.fs.writeFile(filePath, (utils.encode(fileDiff.commits[commitId - 1].content)));
		fileDiff.activeCommit = commitId;
		await saveFileDiff(filePath, fileDiff);
	} else {
		vscode.window.showErrorMessage(`Diff info not found on file "${filePath}"`);
	}
}

export async function createCommit(filePath?: vscode.Uri) {
	let newData;
	if (!filePath) {
		filePath = vscode.window.activeTextEditor!.document.uri;
		newData = vscode.window.activeTextEditor!.document.getText();
	} else {
		newData = (await vscode.workspace.fs.readFile(filePath)).toString();
	}
	let fileDiff = await loadFileDiff(filePath);
	let commitName = await vscode.window.showInputBox();
	const commitDate = new Date();
	if (!commitName) {
		commitName = `Commit${fileDiff ? fileDiff.commits.length : 1}-${utils.formatDate(commitDate, config.dateFormat)}`;
	}
	const createdCommit: commit = {
		name: commitName,
		date: commitDate.toLocaleString(),
		content: newData
	}
	if (fileDiff) {
		newCommit(fileDiff, newData);
		saveFileDiff(filePath, fileDiff);
	} else {
		createDiffFile(filePath, createdCommit);
	}
}

function createDiffFile(filePath: vscode.Uri, initCommit?: commit) {
	const fileDiff: diff = {
		activeCommit: 0,
		activePatch: 0,
		commits: [],
		patches: []
	};
	if (initCommit) {
		newCommit(fileDiff, initCommit);
	}
	createFile(diffPathOf(filePath), JSON.stringify(fileDiff, null, 4));
}

async function init(): Promise<void> {
	if (await fileExists(lh_ignore_file)) {
		return;
	} else {
		if (!(await fileExists(lh_dir))) {
			await vscode.workspace.fs.createDirectory(lh_dir);
		}
		await vscode.workspace.fs.writeFile(lh_ignore_file, utils.encode(`.lh/*${EOL}`));
	}
}

export async function createFile(filePath: vscode.Uri, data?: string | undefined) {
	if (await fileExists(filePath)) {
		return;
	}
	await vscode.workspace.fs.createDirectory(parentFolder(filePath));
	await vscode.workspace.fs.writeFile(filePath, utils.encode(data));
}

export async function fileExists(filePath: vscode.Uri): Promise<boolean> {
	try {
		const f = await vscode.workspace.fs.stat(filePath);
		f;
	} catch {
		return false;
	}
	return true;
}

function parentFolder(uriPath: vscode.Uri): vscode.Uri {
	return vscode.Uri.joinPath(uriPath, '..');
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "local-history" is now active!');
	await init();
	await loadIgnoreFile();
	initGUI();
	let restorePatchCmd = vscode.commands.registerCommand('local-history.restore-patch', restorePatch);
	let restoreCommitCmd = vscode.commands.registerCommand('local-history.restore-commit', restoreCommit);
	let createCommitCmd = vscode.commands.registerCommand('local-history.create-commit', createCommit);
	context.subscriptions.push(createCommitCmd, restorePatchCmd, restoreCommitCmd);
	context.subscriptions.push(onSave);
}

// this method is called when your extension is deactivated
export function deactivate() { }

export type diff = {
	activeCommit: number,
	activePatch: number,
	commits: commit[],
	patches: patch[]
}

export type commit = {
	name: string,
	content: string,
	date: string
}

export type patch = {
	content: string,
	date: string
}

