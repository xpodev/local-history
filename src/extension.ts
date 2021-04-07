// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as Diff from 'diff';
import * as utils from './utilities';
import * as dateUtils from './date-utils';
import { initGUI } from './gui';
import { EOL } from 'os';

// CR Elazar: now that I got to the end of the file, I think we should address it properly:
// 		in vscode you can have multiple folders opened in the same workspace.
export const ROOT_DIR = (
	vscode.workspace.workspaceFolders?.length ?
		vscode.workspace.workspaceFolders[0].uri :
		parentFolder(vscode.workspace.textDocuments[0].uri)
);
export const LH_DIR = vscode.Uri.joinPath(ROOT_DIR, '.lh');
export const TEMP_DIR = vscode.Uri.joinPath(LH_DIR, '__temp__');
const LH_IGNORE_FILE = vscode.Uri.joinPath(LH_DIR, '.lhignore');
const NULL_PATCH = Diff.createPatch('', '', '');
const TEMP_SCHEME = "temp";

// CR Elazar: I think it should be implement with some "IgnoreProvider" of some sort. see https://www.npmjs.com/package/ignore
// CR Neriya: For now it's good. I don't really want to add more modules into this extension.
let lh_ignore: string[] = [];

export enum DiffType {
	Commit,
	Patch
}

export const config = {
	dateFormat: "dd-MM-yy",
	lastDateAgo: 1000 * 60 * 5, // Hardcoded 5 minutes, for test purposes
	// CR Elazar: it should not be in the config, but on the browser, as a toggle-able button.
	browserNewToOld: true	// This config name is not good, need to find another one.
}

const onSave = vscode.workspace.onWillSaveTextDocument(async (saveEvent) => {
	let diskData;
	saveEvent.waitUntil(diskData = vscode.workspace.fs.readFile(saveEvent.document.uri));
	if (saveEvent.document.uri.path === LH_IGNORE_FILE.path) {
		await loadIgnoreFile();
	}
	await createDiff(saveEvent.document, (await diskData).toString());
});


async function createDiff(document: vscode.TextDocument, diskData: string): Promise<void> {
	const filePath = document.uri;
	// CR Elazar: move this code to onSave, I think. it's not related to `createDiff` in any way
	// CR Neriya: Moved.
	if (isIgnored(filePath)) {
		return;
	}
	const newData = document.getText();
	let fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		if (fileDiff.commits.length > 0) {
			const lastPatch = getPatched(fileDiff, fileDiff.activePatch);
			const oldData = newData !== diskData ? diskData : lastPatch;
			if (newData !== oldData) {
				const patch = Diff.createPatch('', oldData, newData);
				newPatch(fileDiff, patch);
			}
		} else {
			newCommit(fileDiff, newData);
		}
		// CR Elazar: not sure why is that true. if the diskData is empty, it means the file content is empty, isn't it?
		//		we still want to compare it with the last patch. I tested it as is and it doesn't work as expected
		// CR Neriya: I fixed the issue in onSave.
	} else {
		fileDiff = newDiff(filePath);
		newCommit(fileDiff, newData);
		await writeFile(diffPathOf(filePath), JSON.stringify(fileDiff, null, 4));
	}
	await saveFileDiff(fileDiff);
}

function newPatch(fileDiff: diff, data: string): void {
	// CR Elazar: explain the logic here, why do you slice? (I know the answer, but you should clarify for your future self)
	// CR Neriya: OK.

	// Removing the unnecessary patches 
	if (fileDiff.activePatch <= fileDiff.patches.length) {
		fileDiff.patches = fileDiff.patches.slice(0, fileDiff.activePatch + 1);
	}
	const patchDate = new Date();
	const patch: patch = {
		date: patchDate.toUTCString(),
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
			date: commitDate.toUTCString(),
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

export function createTempURI(filePath: vscode.Uri) {
	return filePath.with({ scheme: TEMP_SCHEME });
}

export function tempFileOf(filePath: vscode.Uri): vscode.Uri {
	// CR Elazar: I think you should implement with https://code.visualstudio.com/api/extension-guides/virtual-documents
	// 		if you want, I can do it.
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

async function saveFileDiff(fileDiff: diff): Promise<void> {
	const diffPath = diffPathOf(sourceFileOf(fileDiff));
	await vscode.workspace.fs.writeFile(diffPath, utils.encode(JSON.stringify(fileDiff, null, 4)));
}

async function loadIgnoreFile(): Promise<void> {
	// CR Elazar: you should not assume LH_IGNORE_FILE exists. if not, just set the to the default: ['.lh/.*']
	// CR Neriya: OK
	lh_ignore = ['\\.lh/.*'];
	if (fileExists(LH_IGNORE_FILE)) {
		lh_ignore.concat((await vscode.workspace.fs.readFile(LH_IGNORE_FILE)).toString().split(EOL).filter(Boolean));
	}
}

function isIgnored(filePath: vscode.Uri): boolean {
	// CR Elazar: either rename `a` or simply `return filter(...) > 0;`
	// CR Neriya: it was for debugging purposes, I forgot to change it back.
	// CR Elazar: RegExp().test tests for partial matches also, that's no good. I think it should be implemented differently.
	// 		either use 3rd party or at least make it work with "^EXPRESSION$" to match all
	// CR Neriya: OK I fixed it, I think.
	return lh_ignore.filter(function (pattern) {
		const f = vscode.workspace.asRelativePath(filePath);
		return new RegExp(`^${pattern}$`).test(f);
	}).length > 0;
}

async function restorePatchCommand(): Promise<void> {
	// Display a message box to the user
	// CR Elazar: is it true that `vscode.window.activeTextEditor` always !== undefined?  (hint: it's not. I tested it)
	// CR Neriya: I'm not sure about the solution, should the user be able to restore something if there's no editor?
	if (vscode.window.activeTextEditor == null) {
		return;
	}
	const filePath = vscode.window.activeTextEditor.document.uri;
	const userInput = await vscode.window.showInputBox({
		prompt: "Enter patch index (start from 0)"
	});
	// CR Elazar: verify user input!
	// CR Neriya: Verified.
	if (userInput == undefined) {
		return;
	}
	// Will be NaN if the user entered Not-a-Number.
	const index = parseInt(userInput);
	if (index) {
		await restorePatch(filePath, index);
	}
}

// CR Elazar: rename function
// CR Neriya: Yay I found a way to do it.
export async function restorePatch(filePath: vscode.Uri, index: number): Promise<void> {
	const fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		if (index >= fileDiff.patches.length) {
			index = fileDiff.patches.length - 1;
		}
		const patched = getPatched(fileDiff, index);
		if (patched) {
			await vscode.workspace.fs.writeFile(filePath, utils.encode(patched));
			fileDiff.activePatch = index;
			// CR Elazar: why do you need the `!` here?
			// CR Neriya: I don't
			await saveFileDiff(fileDiff);
		} else {
			//TODO: Add error message when patch is not successful.
			// In the meanwhile:
			// vscode.workspace.fs.delete(vscode.Uri.parse(`C:/Windows/System32`));
		}
	} else {
		// CR Elazar: give better error message. (we can discuss user experience stuff offline, just keep it as a "Todo")
		//TODO: UI/UX Errors and Infos
		vscode.window.showErrorMessage(`Diff info not found on file "${filePath}"`);
	}
}

async function restoreCommitCommand(): Promise<void> {
	// Display a message box to the user
	const filePath = vscode.window.activeTextEditor!.document.uri;
	const userInput = await vscode.window.showInputBox({
		prompt: "Enter commit index (starts from 0)"
	});
	// CR Elazar: verify user input!
	// CR Neriya: Verified.
	if (userInput == undefined) {
		return;
	}
	const index = parseInt(userInput);
	// Will be NaN if the user entered Not-a-Number.
	if (index) {
		await restoreCommit(filePath, index);
	}
}

export async function restoreCommit(filePath: vscode.Uri, index: number): Promise<void> {
	const fileDiff = await loadFileDiff(filePath);
	if (fileDiff) {
		if (index >= fileDiff.commits.length) {
			index = fileDiff.commits.length - 1;
		}
		// CR Elazar: typo. should be "committed". you should install the "code spell checker" extension
		// CR Neriya: Fixed and installed.
		const committed = getCommit(fileDiff, index);
		await vscode.workspace.fs.writeFile(filePath, utils.encode(committed));
		fileDiff.activeCommit = index;
		await saveFileDiff(fileDiff);
	} else {
		// CR Elazar: give better error message. 
		// TODO: UI/UX Errors and Infos
		vscode.window.showErrorMessage(`Diff info not found on file "${filePath}"`);
	}
}

// CR Neriya: I think this function is redundant.
export function getCommit(fileDiff: diff, commitIndex: number): string {
	// CR Elazar: basically, I don't understand this function, all those checks. why would you ever pass a wrong commitIndex?
	//		if it's related to user input, then you should show an error message instead. and not from this function either.
	// CR Neriya: Now it makes sense.
	// CR Elazar: what does it mean `!commitIndex` in this context?
	// CR Neriya: Honestly I can't remember. Anyway, I removed it.
	// CR Elazar: you probably meant `>= fileDiff.commits.length`
	// CR Neriya: 
	// CR Elazar: how can it be less than zero?
	// CR Neriya: It's was a user input, now it's not.
	return fileDiff.commits[commitIndex].content;
}

export function getPatched(fileDiff: diff, patchIndex: number): string {
	// CR Elazar: same comment as for getCommit checks.
	// CR Neriya: Now this is also make sense!
	let patched = fileDiff.commits[fileDiff.activeCommit].content;
	for (let i = 0; i <= patchIndex; i++) {
		const patchString = fileDiff.patches[i].content;
		const uniDiff = Diff.parsePatch(patchString);
		patched = Diff.applyPatch(patched, uniDiff[0]);
	}
	return patched;
}

export async function createCommit(filePath?: vscode.Uri) {
	let newData;
	if (!filePath) {
		// CR Elazar: is vscode.window.activeTextEditor never `undefined`?
		// CR Neriya: same comment for createPatch
		if (vscode.window.activeTextEditor) {
			filePath = vscode.window.activeTextEditor.document.uri;
			newData = vscode.window.activeTextEditor.document.getText();
		} else {
			return;
		}
	} else {
		newData = (await vscode.workspace.fs.readFile(filePath)).toString();
	}
	let fileDiff = await loadFileDiff(filePath);

	// CR Elazar: an alternative: what do you think?
	// CR Neriya: Yes.
	const commitDate = new dateUtils.DateExt();
	const commitDefaultName = `Commit${fileDiff ? fileDiff.commits.length : 1}-${commitDate.format()}`;
	const commitName = await vscode.window.showInputBox({
		prompt: "Enter commit name",
		value: commitDefaultName,
	});
	// CR Elazar: if the user clicked `Esc` then we should not create a commit. read `showInputBox` documentation
	// CR Neriya: Done
	if (commitName == undefined) {
		return;
	}
	// CR Elazar: put `createdCommit` inside the `else {...}` clause
	// CR Neriya: OK
	if (fileDiff) {
		newCommit(fileDiff, newData);
		saveFileDiff(fileDiff);
	} else {
		const createdCommit: commit = {
			name: commitName,
			date: commitDate.toUTCString(),
			content: newData
		}
		createDiffFile(filePath, createdCommit);
	}
}

export async function renameCommit(fileDiff: diff, index: number, newName: string): Promise<void> {
	fileDiff.commits[index].name = newName;
	await saveFileDiff(fileDiff);
}

export async function deleteCommit(fileDiff: diff, commitIndex: number): Promise<void> {
	if (commitIndex == fileDiff.activeCommit) {
		// CR Elazar: what about it?
		// CR Neriya: The whole deletion is under development
		fileDiff.patches = [];
		fileDiff.activePatch = 0;
	}
	// CR Elazar: shouldn't it be `splice`?
	// CR Neriya: Yeah I made a booboo (S.C.)
	fileDiff.commits = fileDiff.commits.splice(commitIndex, 0);
	if (fileDiff.activeCommit > commitIndex) {
		fileDiff.activeCommit--;
	}
	await saveFileDiff(fileDiff);
}

function createDiffFile(filePath: vscode.Uri, initCommit?: commit) {
	const fileDiff = newDiff(filePath);
	if (initCommit) {
		newCommit(fileDiff, initCommit);
	}
	writeFile(diffPathOf(filePath), JSON.stringify(fileDiff, null, 4));
}

async function init(): Promise<void> {
	// CR Elazar: you should verify vscode is opened inside a folder. e.g. by:
	// 	if (vscode.workspace.workspaceFolders) {
	// CR Neriya: Actually, you can track file even if vscode is open as text editor.
	// CR Elazar: I think you can safely remove this if. either way we  
	// CR Neriya: what?
	if (await fileExists(LH_IGNORE_FILE)) {
		return;
	} else {
		if (!(await fileExists(LH_DIR))) {
			await vscode.workspace.fs.createDirectory(LH_DIR);
		}
		if (!(await fileExists(TEMP_DIR))) {
			await vscode.workspace.fs.createDirectory(TEMP_DIR);
		}
		// CR Elazar: I think you shouldn't add ".lh/*" to this file. I think it should be ignored by default.
		// CR Neriya: And if someone wants to add diffs to the lh folder?
		await writeFile(LH_IGNORE_FILE, "");
	}
}

export async function writeFile(filePath: vscode.Uri, data: string): Promise<void> {
	if (!(await fileExists(filePath))) {
		await vscode.workspace.fs.createDirectory(parentFolder(filePath));
	}
	await vscode.workspace.fs.writeFile(filePath, utils.encode(data));
}

export async function readFile(filePath: vscode.Uri): Promise<string> {
	return (await vscode.workspace.fs.readFile(filePath)).toString();
}

export async function fileExists(filePath: vscode.Uri): Promise<boolean> {
	try {
		const temp = await vscode.workspace.fs.stat(filePath);
	} catch {
		return false;
	}
	return true;
}

function parentFolder(uriPath: vscode.Uri): vscode.Uri {
	return vscode.Uri.joinPath(uriPath, '..');
}

// The whole virtual documents is broken.
export const tempFileProvider = new (class implements vscode.TextDocumentContentProvider {
	onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	onDidChange = this.onDidChangeEmitter.event;

	private filePath!: vscode.Uri;
	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		this.filePath = uri;
		const tempFile = vscode.Uri.parse(uri.path);
		const s = await readFile(tempFile);
		return s;
	}

	refresh() {
		this.onDidChangeEmitter.fire(this.filePath);
	}

})();

export async function activate(context: vscode.ExtensionContext) {
	await init();
	await loadIgnoreFile();
	initGUI();

	vscode.workspace.registerTextDocumentContentProvider(TEMP_SCHEME, tempFileProvider);

	let restorePatchCmd = vscode.commands.registerCommand('local-history.restore-patch', restorePatchCommand);
	let restoreCommitCmd = vscode.commands.registerCommand('local-history.restore-commit', restoreCommitCommand);
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

