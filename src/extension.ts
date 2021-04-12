// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Diff from 'diff';
import { DateUtils, FileSystemUtils, encode } from './utilities';
import { initGUI, diffNodeProvider } from './gui';
import { EOL } from 'os';
import { DiffExt } from './diff-ext';
import tempFileProvider from './temp-provider';
import { LHWorkspaceFolderProvider, LH_WORKSPACES } from './workspace-folder-provider';

// CR Elazar: now that I got to the end of the file, I think we should address it properly:
// 		in vscode you can have multiple folders opened in the same workspace.
// CR Neriya: Fixed.

const TEMP_SCHEME = "temp";

// CR Elazar: I think it should be implement with some "IgnoreProvider" of some sort. see https://www.npmjs.com/package/ignore
// CR Neriya: For now it's good. I don't really want to add more modules into this extension.

export const config = {
	dateFormat: "dd-MM-yy",
	lastDateAgo: 1000 * 60 * 5, // Hardcoded 5 minutes, for test purposes
	deletePatchesAfterCommit: false
}

const onSave = vscode.workspace.onWillSaveTextDocument(async (saveEvent) => {
	const filePath = saveEvent.document.uri;
	const workspaceFolderId = vscode.workspace.getWorkspaceFolder(filePath)?.index;
	if (workspaceFolderId == undefined) {
		return;
	} else {
		if (await LH_WORKSPACES[workspaceFolderId].isIgnored(filePath)) {
			return;
		} else {
			// let diskData: Promise<string>;
			let diskData = await FileSystemUtils.readFile(saveEvent.document.uri)
			// saveEvent.waitUntil();
			await createDiff(saveEvent.document, diskData);
		}
	}
});

async function createDiff(document: vscode.TextDocument, diskData: string): Promise<void> {
	const filePath = document.uri;
	const newData = document.getText();
	const fileDiff = await DiffExt.load(filePath);
	if (fileDiff.commits.length > 0) {
		const activeCommit = fileDiff.activeCommit;
		const lastPatch = fileDiff.getPatched(activeCommit.activePatchIndex);
		// Dear future Me, this is or when the user is changing document outside of
		// 		VS Code. If it'll check against the disk data it'll break the patches.
		// 		Hope you'll understand.
		const oldData = newData !== diskData ? diskData : lastPatch;
		if (newData !== oldData) {
			const patch = Diff.createPatch('', oldData, newData);
			activeCommit.newPatch(patch);
		}
	} else {
		fileDiff.newCommit(newData);
	}
	await fileDiff.save();
}

export async function restorePatch(filePath: vscode.Uri, index: number): Promise<void> {
	const fileDiff = await DiffExt.load(filePath);
	fileDiff.restorePatch(index);
}

export async function restoreCommit(filePath: vscode.Uri, index: number): Promise<void> {
	const fileDiff = await DiffExt.load(filePath);
	fileDiff.restoreCommit(index);
}

export async function createCommit(filePath?: vscode.Uri) {
	let newData;
	if (!filePath) {
		// CR Elazar: is vscode.window.activeTextEditor never `undefined`?
		// CR Neriya: same comment for createPatch
		// CR Elazar: so same answer. disable the command, depends on the state. you can leave the 
		//		code here as is, just in case 
		if (vscode.window.activeTextEditor) {
			filePath = vscode.window.activeTextEditor.document.uri;
			newData = vscode.window.activeTextEditor.document.getText();
		} else {
			return;
		}
	} else {
		newData = (await vscode.workspace.fs.readFile(filePath)).toString();
	}
	const fileDiff = await DiffExt.load(filePath);
	const commitDate = new DateUtils.DateExt();
	const commitDefaultName = `Commit${fileDiff ? fileDiff.commits.length : 1}-${commitDate.format()}`;
	let commitName = await vscode.window.showInputBox({
		prompt: "Enter commit name",
		value: commitDefaultName,
	});

	// Removing space at the beginning and the end of the string.
	commitName = commitName?.replace(/^\s*/, "").replace(/\s*$/, "");

	if (!commitName) {
		return;
	}

	fileDiff.newCommit(newData, commitName);
	await fileDiff.save();
	await diffNodeProvider.refresh();
}

async function init(): Promise<void> {
	// CR Elazar: you should verify vscode is opened inside a folder. e.g. by:
	// 	if (vscode.workspace.workspaceFolders) {
	// CR Neriya: Actually, you can track file even if vscode is open as text editor.
	// CR Elazar: and where it's going to be saved, the history json files?

	// CR Elazar: I think you can safely remove this if. either way we  
	// CR Neriya: what?
	// CR Elazar: forgot to finish the sentence... won't it work to simply createDirectory?
	//		the documentation hints it would not be a problem if it's already exists.
	//		if so, you can trim this function into 3 lines.  
	if (vscode.workspace.workspaceFolders) {
		for (const folder of vscode.workspace.workspaceFolders) {
			const workspaceFolder = new LHWorkspaceFolderProvider(folder);
			await workspaceFolder.init();
			LH_WORKSPACES.push(workspaceFolder);
		}
	}
}

export async function activate(context: vscode.ExtensionContext) {
	await init();
	initGUI();

	vscode.workspace.registerTextDocumentContentProvider(TEMP_SCHEME, tempFileProvider);

	const createCommitCmd = vscode.commands.registerCommand('local-history.create-commit', async () => {
		await createCommit();
	});

	context.subscriptions.push(createCommitCmd);
	context.subscriptions.push(onSave);
}

// this method is called when your extension is deactivated
export function deactivate() { }

export type diff = {
	sourceFile: string,
	activeCommit: number,
	commits: commit[]
}

export type commit = {
	name: string,
	content: string,
	activePatchIndex: number,
	patches: patch[],
	date: string
}

export type patch = {
	content: string,
	date: string
}

