// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Diff from 'diff';
import * as utils from './utilities';
import * as dateUtils from './date-utils';
import { initGUI } from './gui';
import { EOL } from 'os';

export const ROOT_DIR = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0].uri : parentFolder(vscode.workspace.textDocuments[0].uri);
export const LH_DIR = vscode.Uri.joinPath(ROOT_DIR, '.lh');
export const TEMP_DIR = vscode.Uri.joinPath(LH_DIR, '__temp__');
const LH_IGNORE_FILE = vscode.Uri.joinPath(LH_DIR, '.lhignore');
const NULL_PATCH = Diff.createPatch('', '', '');

let lh_ignore: string[] = [];

export enum DiffType {
	Commit,
	Patch
}

export const config = {
	dateFormat: "dd-MM-yy",
	lastDateAgo: 1000 * 60 * 5, // Hardcoded 5 minutes, for test purposes
	browserNewToOld: true	// This config name is not good, need to find antoher one.
}

const onSave = vscode.workspace.onWillSaveTextDocument(async (document) => {
	const diskData = (await vscode.workspace.fs.readFile(document.document.uri)).toString();
	await createDiff(document, diskData);
});

async function createDiff(document: vscode.TextDocumentWillSaveEvent, diskData: string): Promise<void> {
	const filePath = document.document.uri;
	if (filePath.path === LH_IGNORE_FILE.path) {
		await loadIgnoreFile();
	}
	if (isIgnored(filePath)) {
		return;
	}
	const newData = document.document.getText();
	let fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		if (fileDiff.commits.length < 1) {
			newCommit(fileDiff, newData);
		} else {
			const lastCommit = fileDiff.commits[fileDiff.activeCommit].content;
			if (newData !== diskData || newData !== lastCommit) {
				const patch = Diff.createPatch('', newData !== diskData ? diskData : lastCommit, newData);
				newPatch(fileDiff, patch);
			}
		}
	} else {
		fileDiff = newDiff(filePath);
		newCommit(fileDiff, newData);
		await writeFile(diffPathOf(filePath), JSON.stringify(fileDiff, null, 4));
	}
	await saveFileDiff(filePath, fileDiff!);
}

function newPatch(fileDiff: diff, data: string): void {
	if (fileDiff.activePatch <= fileDiff.patches.length) {
		fileDiff.patches = fileDiff.patches.slice(0, fileDiff.activePatch + 1);
	}
	const patchDate = new Date();
	const patch: patch = {
		date: patchDate.toLocaleString(),
		content: data
	}
	fileDiff.patches.push(patch);
	fileDiff.activePatch = fileDiff.patches.length - 1;
}

function newCommit(fileDiff: diff, data: string | commit, name?: string): void {
	const commitDate = new Date();
	let createdCommit: commit;
	if (typeof data == 'string') {
		createdCommit = {
			name: name ? name : `Commit-${fileDiff.commits.length}`,
			date: commitDate.toLocaleString(),
			content: data
		}
	} else {
		createdCommit = data;
	}
	fileDiff.commits.push(createdCommit as commit);
	fileDiff.activeCommit = fileDiff.commits.length - 1;
	fileDiff.activePatch = 0;
	fileDiff.patches = [];

	// Elazar think it's better like that
	newPatch(fileDiff, NULL_PATCH);
}

function newDiff(filePath: vscode.Uri): diff {
	return {
		sourceFile: vscode.workspace.asRelativePath(filePath),
		activeCommit: 0,
		activePatch: 0,
		commits: [],
		patches: []
	};
}

function diffPathOf(filePath: vscode.Uri): vscode.Uri {
	const relativeFilePath = vscode.workspace.asRelativePath(filePath);
	return vscode.Uri.joinPath(LH_DIR, `${relativeFilePath}.json`);
}

export function tempFileOf(filePath: vscode.Uri): vscode.Uri {
	return vscode.Uri.joinPath(TEMP_DIR, `tmp-${vscode.workspace.asRelativePath(filePath)}`);
}

export function sourceFileOf(fileDiff: diff): vscode.Uri {
	return vscode.Uri.joinPath(ROOT_DIR, fileDiff.sourceFile);
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
	lh_ignore = (await vscode.workspace.fs.readFile(LH_IGNORE_FILE)).toString().split(EOL).filter(Boolean);
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
	let patchIndex: any = await vscode.window.showInputBox({
		prompt: "Enter patch index (start from 0)"
	});
	patchIndex = parseInt(patchIndex);
	await restorePatchA(filePath, patchIndex);
}

export async function restorePatchA(filePath: vscode.Uri, patchIndex: number): Promise<void> {
	const fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		const patched = await getPatched(fileDiff, patchIndex);
		await vscode.workspace.fs.writeFile(filePath, utils.encode(patched));
		fileDiff.activePatch = patchIndex;
		await saveFileDiff(filePath, fileDiff!);
	} else {
		vscode.window.showErrorMessage(`Diff info not found on file "${filePath}"`);
	}
}

export async function getCommit(fileDiff: diff, commitIndex: number): Promise<string> {
	if (commitIndex != 0) {
		if (!commitIndex || commitIndex > fileDiff.patches.length) {
			commitIndex = fileDiff.activeCommit;
		}
	}
	if (commitIndex < 0) {
		commitIndex = 0;
	}
	return fileDiff.commits[commitIndex].content;
}

export async function getPatched(fileDiff: diff, patchIndex: number): Promise<string | undefined> {
	if (patchIndex != 0) {
		if (!patchIndex || patchIndex > fileDiff.patches.length) {
			patchIndex = fileDiff.patches.length;
		}
	}
	if (patchIndex < 0) {
		return fileDiff.commits[fileDiff.activeCommit].content;
	}
	let patched = fileDiff.commits[fileDiff.activeCommit].content;
	for (let i = 0; i <= patchIndex; i++) {
		const patchString = fileDiff.patches[i].content;
		const uniDiff = Diff.parsePatch(patchString);
		patched = Diff.applyPatch(patched, uniDiff[0]);
	}
	return patched;
}

async function restoreCommit(): Promise<void> {
	// Display a message box to the user
	const filePath = vscode.window.activeTextEditor!.document.uri;
	let commitId: any = await vscode.window.showInputBox({
		prompt: "Enter commit index (starts from 0)"
	});
	commitId = parseInt(commitId);
	await restoreCommitA(filePath, commitId);
}

export async function restoreCommitA(filePath: vscode.Uri, commitIndex: number): Promise<void> {
	const fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		const commited = await getCommit(fileDiff, commitIndex);
		await vscode.workspace.fs.writeFile(filePath, utils.encode(commited));
		fileDiff.activeCommit = commitIndex;
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
	let commitName = await vscode.window.showInputBox({
		prompt: "Enter commit name (default ID-DATE)"
	});
	const commitDate = new dateUtils.DateLH();
	if (!commitName) {
		commitName = `Commit${fileDiff ? fileDiff.commits.length : 1}-${commitDate.format()}`;
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
	const fileDiff = newDiff(filePath);
	if (initCommit) {
		newCommit(fileDiff, initCommit);
	}
	writeFile(diffPathOf(filePath), JSON.stringify(fileDiff, null, 4));
}

async function init(): Promise<void> {
	if (await fileExists(LH_IGNORE_FILE)) {
		return;
	} else {
		if (!(await fileExists(LH_DIR))) {
			await vscode.workspace.fs.createDirectory(LH_DIR);
		}
		if (!(await fileExists(TEMP_DIR))) {
			await vscode.workspace.fs.createDirectory(TEMP_DIR);
		}
		await vscode.workspace.fs.writeFile(LH_IGNORE_FILE, utils.encode(`.lh/*${EOL}`));
	}
}

export async function writeFile(filePath: vscode.Uri, data: string) {
	if (!(await fileExists(filePath))) {
		await vscode.workspace.fs.createDirectory(parentFolder(filePath));
	}
	await vscode.workspace.fs.writeFile(filePath, utils.encode(data));
}

export async function fileExists(filePath: vscode.Uri): Promise<boolean> {
	try {
		const f = await vscode.workspace.fs.stat(filePath);
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
	sourceFile: string,
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

