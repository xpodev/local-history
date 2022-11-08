// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Diff from 'diff';
import { DateUtils, FileSystemUtils } from './utilities';
import { initGUI, diffNodeProvider } from './gui';
import { DiffExt, CommitType } from './diff-ext';
import tempFileProvider from './temp-provider';
import { LHWorkspaceFolderProvider, LH_WORKSPACES } from './workspace-folder-provider';


const TEMP_SCHEME = "temp";
const fileTimeDelay: { [key: string]: number } = {

};

const onSave = vscode.workspace.onWillSaveTextDocument(async (saveEvent) => {
	const filePath = saveEvent.document.uri;
	const workspaceFolderId = vscode.workspace.getWorkspaceFolder(filePath)!.index;
	const relativePath = vscode.workspace.asRelativePath(filePath);
	if (fileTimeDelay[relativePath]) {
		if ((Date.now() - fileTimeDelay[relativePath]) < (vscode.workspace.getConfiguration("local-history").get<number>("commits.patchDelay")! * 1000)) {
			return;
		}
	}
	if (await LH_WORKSPACES[workspaceFolderId].isIgnored(filePath) || !LH_WORKSPACES[workspaceFolderId].enabled) {
		return;
	} else {
		let diskData = await FileSystemUtils.readFile(saveEvent.document.uri);
		await createDiff(saveEvent.document, diskData);
		fileTimeDelay[relativePath] = Date.now();
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
		const commitName = `Commit-${fileDiff.commits.length}`;
		fileDiff.newCommit(newData, commitName);
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
	commitName = commitName?.trim();

	if (!commitName) {
		return;
	}

	fileDiff.newCommit(newData, commitName);
	await fileDiff.save();
	await diffNodeProvider.refresh();
}

async function commitAll(): Promise<void> {
	let commitName = await vscode.window.showInputBox({
		prompt: "Enter commit name"
	});

	// Removing space at the beginning and the end of the string.
	commitName = commitName?.trim();

	if (!commitName) {
		return;
	}
	const now = Date.now();
	for (const folder of LH_WORKSPACES) {
		await saveAll(folder.rootDir.uri, commitName, now);
	}
}

async function saveAll(folder: vscode.Uri, name: string, date: number) {
	const workspaceFolder = LH_WORKSPACES[vscode.workspace.getWorkspaceFolder(folder)!.index];
	const folderContent = await vscode.workspace.fs.readDirectory(folder);
	for (const [fileName, fileType] of folderContent) {
		const filePath = vscode.Uri.joinPath(folder, fileName);

		if (fileType === vscode.FileType.File) {
			if (await workspaceFolder.isIgnored(filePath)) {
				continue;
			} else {
				const commit: CommitType = {
					name: name,
					content: await FileSystemUtils.readFile(filePath),
					activePatchIndex: 0,
					patches: [],
					date: date
				};
				const fileDiff = await DiffExt.load(filePath);
				fileDiff.newCommit(commit, name);
				await fileDiff.save();
			}
		} else if (fileType === vscode.FileType.Directory) {
			if (await workspaceFolder.isIgnored(filePath)) {
				continue;
			}
			await saveAll(filePath, name, date);
		}
	}
}

async function init(): Promise<void> {
	await loadWorkspaceFolders();
}

async function loadWorkspaceFolders() {
	// Reset the array
	LH_WORKSPACES.length = 0;
	if (vscode.workspace.workspaceFolders) {
		for (const folder of vscode.workspace.workspaceFolders) {
			const enabled = vscode.workspace.getConfiguration('local-history', folder).get<boolean>('enable');
			const workspaceFolder = new LHWorkspaceFolderProvider(folder, enabled);
			if (enabled) {
				await workspaceFolder.init();
			}
			LH_WORKSPACES.push(workspaceFolder);
		}
	}
}

class TrackFilesItem {
	constructor(public title: string, public value: TrackFilesOptions) {

	}
}

enum TrackFilesOptions {
	yes,
	no,
	doNotShowAgain
}

const YES = new TrackFilesItem("Yes", TrackFilesOptions.yes);
const NO = new TrackFilesItem("No", TrackFilesOptions.no);
const DO_NOT_SHOW_AGAIN = new TrackFilesItem("Don't show again", TrackFilesOptions.doNotShowAgain);

export async function activate(context: vscode.ExtensionContext) {
	let trackFiles;
	const config = vscode.workspace.getConfiguration('local-history');
	if (!config.get<boolean>('enable') && config.get<boolean>('showTrackPrompt')) {
		trackFiles = await vscode.window.showInformationMessage<TrackFilesItem>("Do you want Local History to track this workspace?", YES, NO, DO_NOT_SHOW_AGAIN);
	}
	if (trackFiles) {
		if (trackFiles.value === TrackFilesOptions.yes) {
			config.update('enable', true);
		} else {
			if (trackFiles.value === TrackFilesOptions.doNotShowAgain) {
				config.update('showTrackPrompt', false);
			}
			config.update('enable', false);
		}
	}
	if (config.get<boolean>('enable') || trackFiles?.value) {
		await init();
		initGUI();

		vscode.workspace.registerTextDocumentContentProvider(TEMP_SCHEME, tempFileProvider);
		vscode.commands.registerCommand("local-history.open-diff", async () => {
			if (vscode.window.activeTextEditor) {
				await diffNodeProvider.selectFile(vscode.window.activeTextEditor.document.uri);
				vscode.commands.executeCommand("localHistoryDiffBrowser.focus");
			}
		});
		const createCommitCmd = vscode.commands.registerCommand('local-history.create-commit', async () => {
			await createCommit();
		});

		vscode.commands.registerCommand('local-history.commit-all', async () => {
			await commitAll();
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