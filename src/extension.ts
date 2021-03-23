// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as Diff from 'diff';
import * as path from 'path';

const root_dir = (vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0].uri.fsPath : path.dirname(vscode.workspace.textDocuments[0].fileName)).split("\\").join("/");
const lh_dir = `${root_dir}/.local`;
const patch_dir = `${lh_dir}/patches`;
const commit_dir = `${lh_dir}/commits`;
const commit_prefix = "commit";
const patch_prefix = "patch";

let numCommits = 0;
let numPatches = 0;

const onSave = vscode.workspace.onWillSaveTextDocument(async (document) => {
	if(document.document.fileName.startsWith(lh_dir) || document.document.fileName.startsWith(lh_dir.split('/').join("\\"))) {
		return;
const lh_ignore_file = `${lh_dir}/.lhignore`;
let lh_ignore: string[] = [];
	}
	const baseFileName = path.basename(document.document.fileName);
	const newData = document.document.getText();
	let oldFileName;
	numCommits = getFileCommits(baseFileName).length;
	if (numCommits < 1) {
		newCommit(baseFileName, newData);
	if (isIgnored(relativeFilePath)) {
		return;
	}
	const diskData = fs.readFileSync(document.document.fileName).toString();
	if (diskData !== newData) {
		numPatches = fs.readdirSync(patch_dir).filter((file) => {
			return new RegExp(`${patch_prefix}-${baseFileName}-[0-9]+.diff`).test(file);
		}).length;
		if (numPatches > 0) {
			oldFileName = `${patch_dir}/${patch_prefix}-${baseFileName}-${numPatches}.diff`;
		} else {
			oldFileName = `${commit_dir}/${commit_prefix}-${baseFileName}-${numCommits}.diff`;
		}
		const newFileName = `${patch_prefix}-${baseFileName}-${numPatches + 1}.diff`;
		const patch = Diff.createTwoFilesPatch(`${oldFileName}`, `${patch_dir}/${newFileName}`, diskData, newData);
		newPatch(newFileName, patch);
	}
});

function newPatch(fileName: string, data: string): void {
	fs.writeFile(`${patch_dir}/${fileName}`, data, (err) => {
		if (err) {
			console.log(err);
		}
	});
}

function newCommit(fileName: string, data: string): void {
	fs.writeFile(`${commit_dir}/${commit_prefix}-${fileName}-${++numCommits}.diff`, data, (err) => {
		if (err) {
			console.log(err);
		}
	});
	getFilePatches(fileName).forEach(file => {
		fs.unlinkSync(`${patch_dir}/${file}`);
	});
}

function getFilePatches(fileName: string): string[] {
	return fs.readdirSync(patch_dir).filter((file) => {
		return new RegExp(`${patch_prefix}-${fileName}-[0-9]+.diff`).test(file);
	})
}

function getFileCommits(fileName: string): string[] {
	return fs.readdirSync(commit_dir).filter((file) => {
		return new RegExp(`${commit_prefix}-${fileName}-[0-9]+.diff`).test(file);
	})
}

function getLastPatch(fileName: string): string {
	const patches = getFilePatches(fileName);
	return patches[patches.length - 1];
}

function getLastCommit(fileName: string): string {
	const commits = getFileCommits(fileName);
	return commits[commits.length - 1];
function loadIgnoreFile(): void {
	lh_ignore = fs.readFileSync(lh_ignore_file).toString().split("\r\n").filter(Boolean);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
function isIgnored(fileName: string): boolean {
	const a = lh_ignore.filter(function (pattern) {
		return new RegExp(pattern).test(fileName);
	}).length > 0;
	return a;
}

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "local-history" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('local-history.restore', async () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		const fileName = path.basename(vscode.window.activeTextEditor!.document.fileName);
		const filePatches = getFilePatches(fileName);
		const lastPatchNumber = filePatches.length;
		let patchId: any = await vscode.window.showInputBox();
		patchId = parseInt(patchId);
		if(!patchId || patchId > lastPatchNumber) {
			patchId = lastPatchNumber;
		}
		const editor = vscode.window.activeTextEditor;
		if (editor == undefined) {
			return;
		}
		// const patchString = fs.readFileSync(`${patch_dir}/${patch_prefix}-${fileName}-${patchId}.diff`).toString();
		// const patchString = fs.readFileSync(`${patch_dir}/${patch_prefix}-${fileName}-1.diff`).toString();
		// fs.writeFileSync(editor.document.uri.fsPath, fs.readFileSync(`${commit_dir}/${getLastCommit(fileName)}`));
		let temp = fs.readFileSync(`${commit_dir}/${getLastCommit(fileName)}`).toString();
		for(let i = 1; i <= patchId; i++) {
			const patchString = fs.readFileSync(`${patch_dir}/${patch_prefix}-${fileName}-${i}.diff`).toString();
			const uniDiff = Diff.parsePatch(patchString);
			temp = Diff.applyPatch(temp, uniDiff[0]);
		}
		fs.writeFileSync(editor.document.fileName, temp);
		// Diff.applyPatches(uniDiff, {
		// 	loadFile: (i, cb) => {
		// 		console.log(i);
		// 		// const f = editor.document.fileName;
		// 		cb(false, temp);
		// 	},
		// 	patched: (i, c, cb) => {
		// 		temp = c;
		// 		cb(false);
		// 	},
		// 	complete: (e) => { 
		// 		console.log(temp);
		// 	}
		// });
		
	});
function init() {
	if (fs.existsSync(lh_ignore_file)) {
		return;
	} else {
		if (fs.existsSync(lh_dir)) {
			fs.writeFileSync(lh_ignore_file, ".lh/*\r\n");
		} else {
			fs.mkdirSync(lh_dir);
		}
	}
}

	init();
	loadIgnoreFile();
	context.subscriptions.push(disposable);
	context.subscriptions.push(onSave);
}

// this method is called when your extension is deactivated
export function deactivate() { }
