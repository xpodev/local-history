// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Diff from 'diff';
import { DateUtils, FileSystemUtils } from './utilities';
import { initGUI, diffNodeProvider } from './gui';
import { DiffExt } from './diff-ext';
import tempFileProvider from './temp-provider';
import { LHWorkspaceFolderProvider, LH_WORKSPACES } from './workspace-folder-provider';


const TEMP_SCHEME = "temp";
const fileTimeDelay: { [key: string]: number } = {

};

const onSave = vscode.workspace.onWillSaveTextDocument(async (saveEvent) => {
	const filePath = saveEvent.document.uri;
	const workspaceFolderId = vscode.workspace.getWorkspaceFolder(filePath)?.index;
	if (workspaceFolderId == undefined) {
		return;
	} else {
		const relativePath = vscode.workspace.asRelativePath(filePath);
		if (fileTimeDelay[relativePath]) {
			if ((Date.now() - fileTimeDelay[relativePath]) < (vscode.workspace.getConfiguration("local-history").get<number>("commits.patchDelay")! * 1000)) {
				return;
			}
		}
		if (await LH_WORKSPACES[workspaceFolderId].isIgnored(filePath)) {
			return;
		} else {
			let diskData = await FileSystemUtils.readFile(saveEvent.document.uri)
			await createDiff(saveEvent.document, diskData);
			fileTimeDelay[relativePath] = Date.now();
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
		// Dear future Me, this is for when the user is changing document outside of
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