import { DiffExt, DiffType } from './diff-ext';
import * as vscode from 'vscode';
import { DateUtils, FileSystemUtils } from './utilities';
import { isLHDir, LH_WORKSPACES } from './workspace-folder-provider';
import tempFileProvider from './temp-provider';

class DiffItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly diff: DiffExt,
        public readonly index: number,
        public readonly type: DiffType,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        if (this.type == DiffType.Commit) {
            const date = new DateUtils.DateExt(this.diff.commits[index].date);
            this.description = date.represent();
            this.contextValue = "commitDiffItem";
        } else if (this.type == DiffType.Patch) {
            const date = new DateUtils.DateExt(this.diff.activePatches[index].date);
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
        const f: PathItem[] = [];
        if (element) {
            return Promise.resolve(this.scanFolder(element.resourceUri));
        }
        LH_WORKSPACES.forEach((folder) => {
            f.push(
                new PathItem(
                    folder.rootDir.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    folder.rootDir.uri
                )
            );
        })
        return f;
    }

    async scanFolder(folderPath: vscode.Uri): Promise<PathItem[]> {
        const folderContent = await vscode.workspace.fs.readDirectory(folderPath);
        const folders: PathItem[] = [];
        const files: PathItem[] = [];
        folderContent.forEach(([fileName, fileType]) => {
            if (isLHDir(vscode.Uri.joinPath(folderPath, fileName))) {
                return;
            }
            const itemPath = vscode.Uri.joinPath(folderPath, fileName);
            switch (fileType) {
                case vscode.FileType.File:
                    files.push(
                        new PathItem(
                            fileName,
                            vscode.TreeItemCollapsibleState.None,
                            itemPath,
                            new OpenDiffCmd("Open Diff", "local-history.diff-browser.open-source", [itemPath])
                        ));
                    break;
                case vscode.FileType.Directory:
                    folders.push(
                        new PathItem(
                            fileName,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            itemPath
                        ));
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

class DiffNodeProvider implements vscode.TreeDataProvider<DiffItem> {
    constructor() {

    }

    private _onDidChangeTreeData: vscode.EventEmitter<DiffItem | undefined | void> = new vscode.EventEmitter<DiffItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DiffItem | undefined | void> = this._onDidChangeTreeData.event;

    private currentCommits: DiffItem[] = [];

    private _descending: boolean = true;
    private _currentFile!: vscode.Uri;

    // Change from Commit/Patched to all commits.
    async refresh(): Promise<void> {
        if (this._currentFile) {
            await this.loadCommits();
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: DiffItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    async getChildren(element?: DiffItem): Promise<DiffItem[] | null | undefined> {
        if (element) {
            return Promise.resolve(this.loadPatches(element.diff, element.index));
        } else if (this._currentFile) {
            await this.loadCommits();
            return Promise.resolve(this.currentCommits);
        }
    }

    loadPatches(fileDiff: DiffExt, index: number): DiffItem[] {
        let commitPatches: DiffItem[] = [];
        fileDiff.commits[index].patches.forEach((value, index) => {
            const onOpenPatch = new OpenPatchCmd("Local History: Open Patch", "local-history.diff-browser.open-patch", [fileDiff, index])
            commitPatches.push(new DiffItem(`patch-${index}`, vscode.TreeItemCollapsibleState.None, fileDiff, index, DiffType.Patch, onOpenPatch));
        });
        if (this._descending) {
            commitPatches = commitPatches.reverse();
        }
        return commitPatches;
    }

    async loadCommits() {
        this.currentCommits = [];
        const fileDiff = await DiffExt.load(this._currentFile);
        if (fileDiff.commits.length > 0) {
            fileDiff.commits.forEach((commit, index) => {
                const onOpenCommit = new OpenCommitCmd("Local History: Open Commit", "local-history.diff-browser.open-commit", [fileDiff, index]);
                if (commit.patches.length > 0) {
                    this.currentCommits.push(new DiffItem(fileDiff.commits[index].name, vscode.TreeItemCollapsibleState.Collapsed, fileDiff, index, DiffType.Commit));
                } else {
                    this.currentCommits.push(new DiffItem(fileDiff.commits[index].name, vscode.TreeItemCollapsibleState.None, fileDiff, index, DiffType.Commit, onOpenCommit));
                }
            });
            if (this._descending) {
                this.currentCommits = this.currentCommits.reverse();
            }
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


const browserNodeProvider = new BrowserNodeProvider();
export const diffNodeProvider = new DiffNodeProvider();

async function openCommit(fileDiff: DiffExt, index: number) {
    const sourceFile = fileDiff.sourceFile;
    const tempFile = fileDiff.tempURI(DiffType.Commit, index);
    vscode.commands.executeCommand(
        "vscode.diff",
        sourceFile,
        tempFile,
        `${FileSystemUtils.filename(sourceFile)} \u2B0C ${fileDiff.commits[index].name}`
    );
    tempFileProvider.refresh();
}

async function openPatch(fileDiff: DiffExt, index: number) {
    const sourceFile = fileDiff.sourceFile;
    const patched = fileDiff.getPatched(index);
    if (patched) {
        const tempFile = fileDiff.tempURI(DiffType.Patch, index);
        const formattedDate = new DateUtils.DateExt(fileDiff.activeCommit.patches[index].date).represent();
        vscode.commands.executeCommand(
            "vscode.diff",
            sourceFile,
            tempFile,
            `${FileSystemUtils.filename(sourceFile)} \u2B0C patch-${index} ${formattedDate}`
        );
    }
    tempFileProvider.refresh();
}

async function restoreCommit(selectedItem: DiffItem) {
    selectedItem.diff.restoreCommit(selectedItem.index);
}

async function restorePatch(selectedItem: DiffItem) {
    selectedItem.diff.restorePatch(selectedItem.index);
}

async function renameCommit(selectedItem: DiffItem) {
    let commitName = await vscode.window.showInputBox({
        prompt: "Enter commit name",
        value: selectedItem.diff.commits[selectedItem.index].name,
    });

    // Removing space at the beginning and the end of the string.
    commitName = commitName?.replace(/^\s*/, "").replace(/\s*$/, "");

    if (!commitName) {
        return;
    }
    selectedItem.diff.renameCommit(selectedItem.index, commitName);
    await diffNodeProvider.refresh();
}

async function deleteCommit(selectedItem: DiffItem) {
    await selectedItem.diff.deleteCommit(selectedItem.index);
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
    vscode.commands.registerCommand('local-history.diff-browser.open-commit', async (fileDiff: DiffExt, index: number) => {
        await openCommit(fileDiff, index);
    });
    vscode.commands.registerCommand('local-history.diff-browser.open-patch', async (fileDiff: DiffExt, index: number) => {
        await openPatch(fileDiff, index);
    });
    vscode.commands.registerCommand('local-history.diff-browser.restore', async (selectedItem: DiffItem) => {
        if (selectedItem.type == DiffType.Commit) {
            await restoreCommit(selectedItem);
        } else if (selectedItem.type == DiffType.Patch) {
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