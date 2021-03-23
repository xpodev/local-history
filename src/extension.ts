// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as Diff from 'diff';
import * as path from 'path';
import { EOL } from 'os';

const root_dir = unixPath(vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : path.dirname(vscode.workspace.textDocuments[0].fileName));
const lh_dir = `${root_dir}/.lh`;
const lh_ignore_file = `${lh_dir}/.lhignore`;
let lh_ignore: string[] = [];

const onSave = vscode.workspace.onWillSaveTextDocument(createDiff);

function createDiff(document: vscode.TextDocumentWillSaveEvent) {
	const fullPath = unixPath(document.document.fileName);
	const relativeFilePath = relativePath(fullPath);
	if (fullPath === lh_ignore_file) {
		loadIgnoreFile();
	}
	if (isIgnored(relativeFilePath)) {
		return;
	}
	const newData = document.document.getText();
	let fileDiff = loadFileDiff(relativeFilePath);
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
		createFile(diffPathOf(relativeFilePath));
	}
	saveFileDiff(relativeFilePath, fileDiff);
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

function diffPathOf(relativeFilePath: string): string {
	return `${lh_dir}/${relativeFilePath}.json`;
}

function loadFileDiff(relativeFilePath: string): diff | undefined {
	const diffPath = diffPathOf(relativeFilePath);
	return fs.existsSync(diffPath) ? JSON.parse(fs.readFileSync(diffPathOf(relativeFilePath), 'utf-8')) : undefined;
	// return JSON.parse(fs.readFileSync(`${root_dir}/${fileRelativePath}`, "utf-8"));
}

function saveFileDiff(relativeFilePath: string, fileDiff: diff) {
	const diffPath = diffPathOf(relativeFilePath);
	fs.writeFileSync(diffPath, JSON.stringify(fileDiff, null, 4));
}

function loadIgnoreFile(): void {
	lh_ignore = fs.readFileSync(lh_ignore_file).toString().split(EOL).filter(Boolean);
}

function isIgnored(fileName: string): boolean {
	const a = lh_ignore.filter(function (pattern) {
		return new RegExp(pattern).test(fileName);
	}).length > 0;
	return a;
}

function unixPath(path: string): string {
	return path.split("\\").join("/");
}

function relativePath(path: string): string {
	return unixPath(path).replace(root_dir + "/", "");
}

async function restorePatch() {
	// Display a message box to the user
	const relativeFilePath = relativePath(vscode.window.activeTextEditor!.document.fileName);
	let patchId: any = await vscode.window.showInputBox();
	patchId = parseInt(patchId);
	restorePatchA(relativeFilePath, patchId);
}

function restorePatchA(relativeFilePath: string, patchId: number) {
	const fileDiff = loadFileDiff(relativeFilePath);
	if(fileDiff) {
		if (!patchId || patchId > fileDiff.patches.length) {
			patchId = fileDiff.patches.length;
		}
		let temp = fileDiff.commits[fileDiff.activeCommit - 1];
		for (let i = 0; i < patchId; i++) {
			const patchString = fileDiff.patches[i];
			const uniDiff = Diff.parsePatch(patchString);
			temp = Diff.applyPatch(temp, uniDiff[0]);
		}
		fs.writeFileSync(`${root_dir}/${relativeFilePath}`, temp);
		fileDiff.activePatch = patchId;
		saveFileDiff(relativeFilePath, fileDiff);
	} else {
		vscode.window.showErrorMessage(`Diff info not found on file ${relativeFilePath}`);
	}
}

function init() {
	if (fs.existsSync(lh_ignore_file)) {
		return;
	} else {
		if (fs.existsSync(lh_dir)) {
			fs.writeFileSync(lh_ignore_file, `.lh/*${EOL}`);
		} else {
			fs.mkdirSync(lh_dir);
		}
	}
}

function createFile(relativePath: string, data?: string | undefined) {
	if (fs.existsSync(`${root_dir}/${relativePath}`)) {
		return;
	}
	fs.mkdirSync(path.dirname(relativePath), { recursive: true });
	fs.writeFileSync(relativePath, data);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "local-history" is now active!');
	init();
	loadIgnoreFile();
	let disposable = vscode.commands.registerCommand('local-history.restore', restorePatch);
	context.subscriptions.push(disposable);
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
