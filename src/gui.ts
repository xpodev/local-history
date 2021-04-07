import * as vscode from 'vscode';
import { DateExt } from './date-utils';
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
            const date = new DateExt(this.diff.commits[index].date);
            this.description = date.represent();
            this.contextValue = "commitDiffItem";
        } else if (this.type == lh.DiffType.Patch) {
            const date = new DateExt(this.diff.patches[index].date);
            this.description = date.represent();
            this.contextValue = "patchDiffItem";
        }
    }
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
        folderContent.forEach(([fileName, fileType]) => {
            if (vscode.Uri.joinPath(folderPath, fileName).path === lh.LH_DIR.path) {
                return;
            }
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
    private readonly rootDirectories: DiffBrowserItem[] = [
        new DiffBrowserItem(COMMITS_LABEL, vscode.TreeItemCollapsibleState.Collapsed),
        new DiffBrowserItem(PATCHES_LABEL, vscode.TreeItemCollapsibleState.Collapsed)
    ];

    private _descending: boolean = true;
    private _currentFile!: vscode.Uri;

    async refresh(): Promise<void> {
        this.currentCommits = [];
        this.currentPatches = [];
        this._currentFile = this._currentFile;
        const fileDiff = await lh.loadFileDiff(this._currentFile);
        if (fileDiff) {
            fileDiff.commits.forEach((value, index) => {
                const onOpenCommit = new OpenCommitCmd("Local History: Open Commit", "local-history.diff-browser.open-commit", [fileDiff, index])
                this.currentCommits.push(new DiffItem(fileDiff.commits[index].name, vscode.TreeItemCollapsibleState.None, fileDiff, index, lh.DiffType.Commit, onOpenCommit));
            });
            fileDiff.patches.forEach((value, index) => {
                const onOpenPatch = new OpenPatchCmd("Local History: Open Patch", "local-history.diff-browser.open-patch", [fileDiff, index])
                this.currentPatches.push(new DiffItem(`patch-${index + 1}`, vscode.TreeItemCollapsibleState.None, fileDiff, index, lh.DiffType.Patch, onOpenPatch));
            });
        }
        if (this._descending) {
            this.currentCommits = this.currentCommits.reverse();
            this.currentPatches = this.currentPatches.reverse();
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: DiffBrowserItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: DiffBrowserItem): vscode.ProviderResult<DiffBrowserItem[]> {
        if (element) {
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
        this._currentFile = filePath;
        await this.refresh();
    }

    async toggleOrder() {
        this._descending = !this._descending;
        await this.refresh();
    }
}


const diffNodeProvider = new DiffNodeProvider();
const browserNodeProvider = new BrowserNodeProvider();

async function openCommit(fileDiff: lh.diff, commitIndex: number) {
    const sourceFile = lh.sourceFileOf(fileDiff);
    const tempFile = lh.tempFileOf(sourceFile);
    const tempUri = lh.createTempURI(tempFile);
    await lh.writeFile(tempFile, lh.getCommit(fileDiff, commitIndex));
    vscode.commands.executeCommand("vscode.diff", sourceFile, tempUri, undefined, { preview: false });
    lh.tempFileProvider.refresh();
}

async function openPatch(fileDiff: lh.diff, patchIndex: number) {
    const sourceFile = lh.sourceFileOf(fileDiff);
    const patched = lh.getPatched(fileDiff, patchIndex);
    if (patched) {
        const tempFile = lh.tempFileOf(sourceFile);
        await lh.writeFile(tempFile, patched);
        const tempUri = lh.createTempURI(tempFile);
        vscode.commands.executeCommand("vscode.diff", sourceFile, tempUri, undefined, { preview: false });
    }
    lh.tempFileProvider.refresh();
}

async function restoreCommit(selectedItem: DiffItem) {
    lh.restoreCommit(lh.sourceFileOf(selectedItem.diff), selectedItem.index);
}

async function restorePatch(selectedItem: DiffItem) {
    lh.restorePatch(lh.sourceFileOf(selectedItem.diff), selectedItem.index);
}

async function renameCommit(selectedItem: DiffItem) {
    const commitName = await vscode.window.showInputBox({
        prompt: "Enter commit name",
        value: selectedItem.diff.commits[selectedItem.index].name,
    });
    if (commitName == undefined) {
        return;
    }
    lh.renameCommit(selectedItem.diff, selectedItem.index, commitName);
}

async function deleteCommit(selectedItem: DiffItem) {
    await lh.deleteCommit(selectedItem.diff, selectedItem.index);
    await diffNodeProvider.refresh();
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
    });
    vscode.commands.registerCommand('local-history.diff-browser.delete-commit', async (selectedItem: DiffItem) => {
        await deleteCommit(selectedItem);
    });
    vscode.commands.registerCommand('local-history.diff-browser.rename-commit', async (selectedItem: DiffItem) => {
        await renameCommit(selectedItem);
    });
    vscode.commands.registerCommand('local-history.diff-browser.change-order', async (selectedItem: DiffItem) => {
        await diffNodeProvider.toggleOrder();
    });

    vscode.workspace.onDidCreateFiles(async (e) => {
        browserNodeProvider.refresh();
        await diffNodeProvider.refresh();
    });
    vscode.workspace.onDidDeleteFiles(async (e) => {
        browserNodeProvider.refresh();
        await diffNodeProvider.refresh();
    });
    vscode.workspace.onDidRenameFiles(async (e) => {
        browserNodeProvider.refresh();
        await diffNodeProvider.refresh();
    });
    vscode.workspace.onDidChangeTextDocument(async (e) => {
        await diffNodeProvider.refresh();
    });
    vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
        browserNodeProvider.refresh();
        await diffNodeProvider.refresh();
    });
}