import { DiffExtended, DiffType } from './diff-ext';
import * as vscode from 'vscode';
import { DateUtils, FileSystemUtils } from './utilities';
import { isLocalHistoryDir, localHistoryWorkspaces } from './workspace-folder-provider';
import tempFileProvider from './temp-provider';

class DiffItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly diff: DiffExtended,
        public readonly index: number,
        public readonly type: DiffType,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }
}

class CommitItem extends DiffItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly diff: DiffExtended,
        public readonly index: number,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState, diff, index, DiffType.commit);
        const date = new DateUtils.DateExt(this.diff.commits[index].date);
        this.description = date.represent();
    }

    contextValue = 'commitDiffItem';
}

class PatchItem extends DiffItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly diff: DiffExtended,
        public readonly index: number,
        public readonly commitIndex: number,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState, diff, index, DiffType.patch);
        const date = new DateUtils.DateExt(this.diff.commits[commitIndex].patches[index].date);
        this.description = date.represent();
    }

    contextValue = 'patchDiffItem';
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

    async getChildren(element?: PathItem): Promise<PathItem[] | null | undefined> {
        const rootFolders: PathItem[] = [];
        if (element) {
            return Promise.resolve(this.scanFolder(element.resourceUri));
        } else {
            for (const folder of localHistoryWorkspaces) {
                if (await FileSystemUtils.fileExists(vscode.Uri.joinPath(folder.rootDir.uri, '.lh'))) {
                    rootFolders.push(
                        new PathItem(
                            folder.rootDir.name,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            folder.rootDir.uri
                        )
                    );
                }
            }
            return rootFolders;
        }
    }

    async scanFolder(folderPath: vscode.Uri): Promise<PathItem[]> {
        const folderContent = await vscode.workspace.fs.readDirectory(folderPath);
        const folders: PathItem[] = [];
        const files: PathItem[] = [];
        folderContent.forEach(async ([fileName, fileType]) => {
            const itemPath = vscode.Uri.joinPath(folderPath, fileName);
            if (isLocalHistoryDir(itemPath)) {
                return;
            }
            switch (fileType) {
                case vscode.FileType.File:
                    files.push(
                        new PathItem(
                            fileName,
                            vscode.TreeItemCollapsibleState.None,
                            itemPath,
                            new OpenDiffCmd('Open Diff', 'local-history.diff-browser.open-source', [itemPath])
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
                case vscode.FileType.SymbolicLink:
                    const realPath = FileSystemUtils.realPath(itemPath);
                    const pathItem = new PathItem(
                        fileName,
                        vscode.TreeItemCollapsibleState.None,
                        itemPath,
                        new OpenDiffCmd('Open Diff', 'local-history.diff-browser.open-source', [realPath])
                    );
                    pathItem.description = '⎘';
                    files.push(pathItem);
                    break;
                default:
                // return;
            }
            // @ts-ignore For some reason fileType of Symbolic link is 65 and not 64
            if (fileType === 65 || fileType === 64) {
                const realPath = FileSystemUtils.realPath(itemPath);
                const pathItem = new PathItem(
                    fileName,
                    vscode.TreeItemCollapsibleState.None,
                    itemPath,
                    new OpenDiffCmd('Open Diff', 'local-history.diff-browser.open-source', [realPath])
                );
                pathItem.description = '⎘';
                files.push(pathItem);
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

    private currentCommits: CommitItem[] = [];

    private _descending: boolean = true;
    private _currentFile!: vscode.Uri;

    // Change from Commit/Patched to all commits.
    async refresh(): Promise<void> {
        if (this._currentFile) {
            await this.loadCommits();
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: DiffItem): DiffItem | Thenable<DiffItem> {
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

    loadPatches(fileDiff: DiffExtended, commitIndex: number): DiffItem[] {
        let commitPatches: PatchItem[] = [];
        fileDiff.commits[commitIndex].patches.forEach((value, patchIndex) => {
            const onOpenPatch = new OpenPatchCmd('Local History: Open Patch', 'local-history.diff-browser.open-patch', [fileDiff, patchIndex, commitIndex]);
            commitPatches.push(new PatchItem(`patch-${patchIndex}`, vscode.TreeItemCollapsibleState.None, fileDiff, patchIndex, commitIndex, onOpenPatch));
        });
        if (this._descending) {
            commitPatches = commitPatches.reverse();
        }
        return commitPatches;
    }

    async loadCommits() {
        this.currentCommits = [];
        const fileDiff = await DiffExtended.load(this._currentFile);
        if (fileDiff.commits.length > 0) {
            fileDiff.commits.forEach((commit, index) => {
                const onOpenCommit = new OpenCommitCmd('Local History: Open Commit', 'local-history.diff-browser.open-commit', [fileDiff, index]);
                if (commit.patches.length > 0) {
                    this.currentCommits.push(new CommitItem(fileDiff.commits[index].name, vscode.TreeItemCollapsibleState.Collapsed, fileDiff, index));
                } else {
                    this.currentCommits.push(new CommitItem(fileDiff.commits[index].name, vscode.TreeItemCollapsibleState.None, fileDiff, index, onOpenCommit));
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
        const config = vscode.workspace.getConfiguration('local-history');
        await config.update('browser.descending', this._descending);
        await this.refresh();
    }
}


const browserNodeProvider = new BrowserNodeProvider();
export const diffNodeProvider = new DiffNodeProvider();

async function openCommit(fileDiff: DiffExtended, index: number) {
    const sourceFile = fileDiff.sourceFile;
    const tempFile = fileDiff.tempURI(index, 0);
    await vscode.commands.executeCommand(
        'vscode.diff',
        sourceFile,
        tempFile,
        `${FileSystemUtils.filename(sourceFile)} \u2B0C ${fileDiff.commits[index].name}`
    );
    tempFileProvider.refresh();
    vscode.commands.executeCommand('localHistoryDiffBrowser.focus');
}

async function openPatch(fileDiff: DiffExtended, patchIndex: number, commitIndex: number) {
    const sourceFile = fileDiff.sourceFile;
    const patched = fileDiff.getPatched(patchIndex, commitIndex);
    if (patched || patched === '') {
        const tempFile = fileDiff.tempURI(commitIndex, patchIndex);
        const formattedDate = new DateUtils.DateExt(fileDiff.commits[commitIndex].patches[patchIndex].date).represent();
        await vscode.commands.executeCommand(
            'vscode.diff',
            sourceFile,
            tempFile,
            `${FileSystemUtils.filename(sourceFile)} \u2B0C patch-${patchIndex} ${formattedDate}`
        );
    }
    tempFileProvider.refresh();
    vscode.commands.executeCommand('localHistoryDiffBrowser.focus');
}

async function restoreCommit(selectedItem: CommitItem) {
    selectedItem.diff.restoreCommit(selectedItem.index);
}

async function restorePatch(selectedItem: PatchItem) {
    selectedItem.diff.restorePatch(selectedItem.index, selectedItem.commitIndex);
}

async function renameCommit(selectedItem: DiffItem) {
    let commitName = await vscode.window.showInputBox({
        prompt: 'Enter commit name',
        value: selectedItem.diff.commits[selectedItem.index].name,
    });

    // Removing space at the beginning and the end of the string.
    commitName = commitName?.replace(/^\s*/, '').replace(/\s*$/, '');

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

    vscode.commands.registerCommand('local-history.diff-browser.refresh-file-browser', () => {
        browserNodeProvider.refresh();
    });
    vscode.commands.registerCommand('local-history.diff-browser.open-source', async (filePath: vscode.Uri) => {
        await diffNodeProvider.selectFile(filePath);
    });
    vscode.commands.registerCommand('local-history.diff-browser.open-commit', async (fileDiff: DiffExtended, index: number) => {
        await openCommit(fileDiff, index);
    });
    vscode.commands.registerCommand('local-history.diff-browser.open-patch', async (fileDiff: DiffExtended, patchIndex: number, commitIndex: number) => {
        await openPatch(fileDiff, patchIndex, commitIndex);
    });
    vscode.commands.registerCommand('local-history.diff-browser.restore', async (selectedItem: DiffItem) => {
        if (selectedItem.type === DiffType.commit) {
            await restoreCommit(selectedItem as CommitItem);
        } else if (selectedItem.type === DiffType.patch) {
            await restorePatch(selectedItem as PatchItem);
        }
    });
    vscode.commands.registerCommand('local-history.diff-browser.delete-commit', async (selectedItem: DiffItem) => {
        await deleteCommit(selectedItem);
    });
    vscode.commands.registerCommand('local-history.diff-browser.rename-commit', async (selectedItem: DiffItem) => {
        await renameCommit(selectedItem);
    });
    vscode.commands.registerCommand('local-history.diff-browser.order-ascending', async () => {
        await diffNodeProvider.toggleOrder();
    });
    vscode.commands.registerCommand('local-history.diff-browser.order-descending', async () => {
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