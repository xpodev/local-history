import * as vscode from 'vscode';
import { DateLH } from './date-utils';
import * as lh from './extension';

const COMMITS_LABEL = "Commits";
const PATCHES_LABEL = "Patches";

class DiffBrowserItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
    // CR Elazar: seems to not being used anywhere in the code
    // CR Neriya: Removed.
}

class DiffItem extends DiffBrowserItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly diff: lh.diff,
        public readonly index: number,
        public readonly type: lh.DiffType,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState, command);
        if (this.type == lh.DiffType.Commit) {
            // CR Elazar: as we talked about, use a function that given a date return the representation (e.g. 5 minutes ago)
            // CR Neriya: I updated all the dates utilities to be one class that extends Date.
            const date = new DateLH(this.diff.commits[index].date);
            this.description = date.represent();
        } else if (this.type == lh.DiffType.Patch) {
            const date = new DateLH(this.diff.patches[index].date);
            this.description = date.represent();
        }
    }

    contextValue = 'browserDiffItem';
}

class OpenCommitCmd implements vscode.Command {
    constructor(
        public readonly title: string,
        public readonly command: string,
        public readonly args?: any[],
        public readonly tooltip?: string
    ) {

    }

    get arguments() {
        return this.args;
    }
}

class OpenPatchCmd implements vscode.Command {
    constructor(
        public readonly title: string,
        public readonly command: string,
        public readonly args?: any[],
        public readonly tooltip?: string
    ) {

    }

    get arguments() {
        return this.args;
    }

}

class OpenDiffCmd implements vscode.Command {
    constructor(
        public readonly title: string,
        public readonly command: string,
        public readonly args?: any[],
        public readonly tooltip?: string
    ) {

    }

    get arguments() {
        return this.args;
    }

}

class BrowserNodeProvider implements vscode.TreeDataProvider<PathItem> {
    constructor() {

    }

    private _onDidChangeTreeData: vscode.EventEmitter<PathItem | undefined | void> = new vscode.EventEmitter<PathItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<PathItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: PathItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: PathItem): vscode.ProviderResult<PathItem[]> {
        return Promise.resolve(this.scanFolder(element ? element.resourceUri : lh.ROOT_DIR));
    }

    async scanFolder(folderPath: vscode.Uri): Promise<PathItem[]> {
        const folderContent = await vscode.workspace.fs.readDirectory(folderPath);
        const folders: PathItem[] = [];
        const files: PathItem[] = [];
        // CR Elazar: maybe change to f.forEach(([relativePath, fileType]) ... instead? better than using value[0] value[1]
        // CR Neriya: Changed
        folderContent.forEach(([fileName, fileType]) => {
            // CR Elazar: does emitting the `.path` works also? like: vscode.Uri.joinPath(folderPath, value[0]) === lh.LH_DIR
            if (vscode.Uri.joinPath(folderPath, fileName).path === lh.LH_DIR.path) {
                return;
            }
            // CR Elazar: since we don't use `collapsibleState` outside of the "switch", I don't think declaring it with "let" 
            //      is clearer. you can simply pass the required value. if you do want to declare, there's a trick to overcome the 
            //      switch case issue, using brackets: `case ...: { ...<code here>; break; }`.
            // CR Neriya: Updated switch, removed the variable.
            const itemPath = vscode.Uri.joinPath(folderPath, fileName);
            switch (fileType) {
                case vscode.FileType.File:
                    files.push(new PathItem(fileName, vscode.TreeItemCollapsibleState.None, itemPath, new OpenDiffCmd("Open Diff", "local-history.diff-browser.open-source", [itemPath])));
                    break;
                case vscode.FileType.Directory:
                    folders.push(new PathItem(fileName, vscode.TreeItemCollapsibleState.Collapsed, itemPath, new OpenDiffCmd("Open Diff", "local-history.diff-browser.open-source", [itemPath])));
                    break;
                default:
                    return;
            }

        });
        return folders.concat(files);
    }

}

class PathItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly resourceUri: vscode.Uri,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }

    contextValue = 'browserPathItem';
}

class DiffNodeProvider implements vscode.TreeDataProvider<DiffBrowserItem> {
    constructor() {

    }

    private _onDidChangeTreeData: vscode.EventEmitter<DiffBrowserItem | undefined | void> = new vscode.EventEmitter<DiffBrowserItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DiffBrowserItem | undefined | void> = this._onDidChangeTreeData.event;

    private currentCommits: DiffBrowserItem[] = [];
    private currentPatches: DiffBrowserItem[] = [];
    // CR Elazar: this line is wayyy to long
    // CR Neriya: happy now?
    private readonly rootDirectories: DiffBrowserItem[] = [
        new DiffBrowserItem(COMMITS_LABEL, vscode.TreeItemCollapsibleState.Collapsed),
        new DiffBrowserItem(PATCHES_LABEL, vscode.TreeItemCollapsibleState.Collapsed)
    ];

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: DiffBrowserItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: DiffBrowserItem): vscode.ProviderResult<DiffBrowserItem[]> {
        if (element) {
            // CR Elazar: either declare a constants for "Commits" and "Patches", or use an enum, or separate this
            //      class into 2 providers (e.g. `DiffNodeProvider` that uses `CommitNodeProvider` `PatchNodeProvider`
            //      or something similar)
            // CR Neriya: Declared constants.
            if (element.label === COMMITS_LABEL) {
                return Promise.resolve(this.currentCommits);
            } else if (element.label === PATCHES_LABEL) {
                return Promise.resolve(this.currentPatches);
            }
        } else {
            return this.rootDirectories;
        }
    }

    async selectFile(filePath: vscode.Uri) {
        this.currentCommits = [];
        this.currentPatches = [];
        const fileDiff = await lh.loadFileDiff(filePath);
        if (fileDiff) {
            fileDiff.commits.forEach((value, index) => {
                const onOpenCommit = new OpenCommitCmd("Local History: Open Commit", "local-history.diff-browser.open-commit", [fileDiff, index])
                // CR Elazar: we talked about "sorting". you should implement this part using push (faster), and then reverse 
                //      if the "sorting state" indicate it. anyway, `unshift` is much slower then `push`.
                // CR Neriya: Changed.
                this.currentCommits.push(new DiffItem(fileDiff.commits[index].name, vscode.TreeItemCollapsibleState.None, fileDiff, index, lh.DiffType.Commit, onOpenCommit));
            });
            fileDiff.patches.forEach((value, index) => {
                const onOpenPatch = new OpenPatchCmd("Local History: Open Patch", "local-history.diff-browser.open-patch", [fileDiff, index])
                this.currentPatches.push(new DiffItem(`patch-${index + 1}`, vscode.TreeItemCollapsibleState.None, fileDiff, index, lh.DiffType.Patch, onOpenPatch));
            });
        }
        if(lh.config.browserNewToOld) {
            this.currentCommits = this.currentCommits.reverse();
            this.currentPatches = this.currentPatches.reverse();
        }
        this.refresh();
    }

    // CR Elazar: this function seems to be redundant, isn't it?
    // CR Neriya: Very true sir.
}

const browserNodeProvider = new BrowserNodeProvider();
const diffNodeProvider = new DiffNodeProvider();

async function openCommit(fileDiff: lh.diff, commitIndex: number) {
    const sourceFile = lh.sourceFileOf(fileDiff);
    const tempFile = lh.tempFileOf(sourceFile);
    await lh.writeFile(tempFile, await lh.getCommit(fileDiff, commitIndex));
    vscode.commands.executeCommand("vscode.diff", sourceFile, tempFile);
}

async function openPatch(fileDiff: lh.diff, patchIndex: number) {
    const sourceFile = lh.sourceFileOf(fileDiff);
    const patched = await lh.getPatched(fileDiff, patchIndex);
    if (patched) {
        const tempFile = lh.tempFileOf(sourceFile);
        await lh.writeFile(tempFile, patched);
        vscode.commands.executeCommand("vscode.diff", sourceFile, tempFile);
    }
}

async function restoreCommit(selectedItem: DiffItem) {
    lh.restoreCommitA(lh.sourceFileOf(selectedItem.diff), selectedItem.index);
}

async function restorePatch(selectedItem: DiffItem) {
    lh.restorePatchA(lh.sourceFileOf(selectedItem.diff), selectedItem.index);
}

export function initGUI() {
    vscode.window.registerTreeDataProvider('localHistoryFileBrowser', browserNodeProvider);
    vscode.window.registerTreeDataProvider('localHistoryDiffBrowser', diffNodeProvider);

    vscode.commands.registerCommand('local-history.refresh-file-browser', () => {
        browserNodeProvider.refresh();
    });
    vscode.commands.registerCommand('local-history.diff-browser.open-source', async (filePath: vscode.Uri) => {
        await diffNodeProvider.selectFile(filePath);
    });
    vscode.commands.registerCommand('local-history.diff-browser.open-commit', async (fileDiff: lh.diff, index: number) => {
        await openCommit(fileDiff, index);
    });
    vscode.commands.registerCommand('local-history.diff-browser.open-patch', async (fileDiff: lh.diff, index: number) => {
        await openPatch(fileDiff, index);
    });
    vscode.commands.registerCommand('local-history.diff-browser.restore', async (selectedItem: DiffItem) => {
        if (selectedItem.type == lh.DiffType.Commit) {
            await restoreCommit(selectedItem);
        } else if (selectedItem.type == lh.DiffType.Patch) {
            await restorePatch(selectedItem);
        }
    })

    vscode.workspace.onDidCreateFiles((e) => {
        browserNodeProvider.refresh();
        diffNodeProvider.refresh();
    });
    vscode.workspace.onDidDeleteFiles((e) => {
        browserNodeProvider.refresh();
        diffNodeProvider.refresh();
    });
    vscode.workspace.onDidRenameFiles((e) => {
        browserNodeProvider.refresh();
        diffNodeProvider.refresh();
    });
    vscode.workspace.onDidChangeTextDocument((e) => {
        diffNodeProvider.refresh();
    });
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        browserNodeProvider.refresh();
        diffNodeProvider.refresh();
    });
}