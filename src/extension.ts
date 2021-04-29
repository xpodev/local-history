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

// CR Elazar: package.json comments:
//   line 142: add { "when" : "editorTextFocus" } clause

const TEMP_SCHEME = "temp";
// CR Elazar: hmm... the time delay is global to all the files. I don't think that's a good idea. 
//   maybe create a time-delay for each saved file, e.g. in a global dict.
// 	 my suggested flow: check ignored -> check delay -> create diff.
let timeDelay = Date.now();

// CR Elazar: vscode complains `config` is not in use.
const config = {
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
		if ((Date.now() - timeDelay) < vscode.workspace.getConfiguration("local-history").get<number>("commits.patchDelay")!) {
			return;
		}
		if (await LH_WORKSPACES[workspaceFolderId].isIgnored(filePath)) {
			return;
		} else {
			let diskData = await FileSystemUtils.readFile(saveEvent.document.uri)
			await createDiff(saveEvent.document, diskData);
			timeDelay = Date.now();
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
	await loadWorkspaceFolders();
}

async function loadWorkspaceFolders() {
	LH_WORKSPACES.splice(0, LH_WORKSPACES.length);
	if (vscode.workspace.workspaceFolders) {
		for (const folder of vscode.workspace.workspaceFolders) {
			const workspaceFolder = new LHWorkspaceFolderProvider(folder);
			await workspaceFolder.init();
			LH_WORKSPACES.push(workspaceFolder);
		}
	}
}

export async function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.getConfiguration('local-history').get<boolean>('enable')) {
		await init();
		initGUI();

		// CR Elazar: I didn't understand when you choose to add the returned disposable to the context.subscriptions.
		//	for some reason you decided to not add it here, and also not at onDidChangeWorkspaceFolders.
		//  though, I can't tell when it is necessary and when it doesn't 
		vscode.workspace.registerTextDocumentContentProvider(TEMP_SCHEME, tempFileProvider);

		const createCommitCmd = vscode.commands.registerCommand('local-history.create-commit', async () => {
			await createCommit();
		});

		vscode.workspace.onDidChangeWorkspaceFolders(async () => {
			await loadWorkspaceFolders();
		});

		context.subscriptions.push(createCommitCmd);
		context.subscriptions.push(onSave);
	}
}

// this method is called when your extension is deactivated
export function deactivate() { }