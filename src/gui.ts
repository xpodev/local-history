import * as vscode from 'vscode';
import * as lh from './extension';
import * as path from 'path';


class DiffBrowserItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
        if (this.collapsibleState == vscode.TreeItemCollapsibleState.None) {
            this.isFolder = false;
        } else {
            this.isFolder = true;
        }
    }

    public readonly isFolder;

    iconPath = {
        light: path.join(__filename, '..', '..', 'media', 'logo.svg'),
        dark: path.join(__filename, '..', '..', 'media', 'logo.svg'),
    };
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

class ApplyPatch implements vscode.Command {
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
    constructor(private workspaceRoot: vscode.Uri) {

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
        return Promise.resolve(this.scanFolder(element ? element.uri : lh.root_dir));
    }

    async scanFolder(folderPath: vscode.Uri): Promise<PathItem[]> {
        const f = await vscode.workspace.fs.readDirectory(folderPath);
        const folders: PathItem[] = [];
        const files: PathItem[] = [];
        f.forEach((value) => {
            if (vscode.Uri.joinPath(folderPath, value[0]).path === lh.lh_dir.path) {
                return;
            }
            let collapsibleState;
            const itemPath = vscode.Uri.joinPath(folderPath, value[0]);
            switch (value[1]) {
                case vscode.FileType.File:
                    collapsibleState = vscode.TreeItemCollapsibleState.None;
                    files.push(new PathItem(value[0], collapsibleState, itemPath, new OpenDiffCmd("Open Diff", "local-history.diff-browser.open-source", [itemPath])));
                    break;
                case vscode.FileType.Directory:
                    collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                    folders.push(new PathItem(value[0], collapsibleState, itemPath, new OpenDiffCmd("Open Diff", "local-history.diff-browser.open-source", [itemPath])));
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
        public readonly uri: vscode.Uri,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }

    iconPath = {
        light: path.join(__filename, '..', '..', 'media', 'logo.svg'),
        dark: path.join(__filename, '..', '..', 'media', 'logo.svg'),
    };

    contextValue = 'browserPathItem';
}

class DiffNodeProvider implements vscode.TreeDataProvider<DiffBrowserItem> {
    constructor() {

    }

    private _onDidChangeTreeData: vscode.EventEmitter<DiffBrowserItem | undefined | void> = new vscode.EventEmitter<DiffBrowserItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DiffBrowserItem | undefined | void> = this._onDidChangeTreeData.event;

    private currentCommits: DiffBrowserItem[] = [];
    private currentPatches: DiffBrowserItem[] = [];
    private readonly rootDirectories: DiffBrowserItem[] = [new DiffBrowserItem('Commits', vscode.TreeItemCollapsibleState.Collapsed), new DiffBrowserItem('Patches', vscode.TreeItemCollapsibleState.Collapsed)];

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: DiffBrowserItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: DiffBrowserItem): vscode.ProviderResult<DiffBrowserItem[]> {
        if (element) {
            if (element.label == "Commits") {
                return Promise.resolve(this.currentCommits);
            } else if (element.label == "Patches") {
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
                this.currentCommits.unshift(new DiffItem(fileDiff.commits[index].name, vscode.TreeItemCollapsibleState.None, fileDiff, index, lh.DiffType.Commit, onOpenCommit));
            });
            fileDiff.patches.forEach((value, index) => {
                const onOpenPatch = new OpenPatchCmd("Local History: Open Patch", "local-history.diff-browser.open-patch", [fileDiff, index])
                this.currentPatches.unshift(new DiffItem(`patch-${index + 1}`, vscode.TreeItemCollapsibleState.None, fileDiff, index, lh.DiffType.Patch, onOpenPatch));
            });
        }
        this.refresh();
    }

    clearDiff() {
        this.currentPatches = [];
        this.refresh();
    }

}

const browserNodeProvider = new BrowserNodeProvider(lh.root_dir);
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
        // const diff: string = Diff.createTwoFilesPatch('', '', sourcePanel.webview.html.split("<br>").join('\n'), patched, undefined, undefined, { context: 100 });
        // let diffStr = diff.split(`+++ \n`);
        // diffStr.shift();
        // if (!patchedPanel) {
        //     patchedPanel = vscode.window.createWebviewPanel(
        //         'patchedViewer', // Identifies the type of the webview. Used internally
        //         `Patched - ${patchId}`, // Title of the panel displayed to the user
        //         vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        //         {} // Webview options. More on these later.
        //     );
        // }
        // patchedPanel.title = `Diff - ${fileDiff.patches[index].date}`;
        // patchedPanel.webview.html = patched.split("\n").join("<br>");
        // patchedPanel.webview.html = diffStr.join('').split('\n').join("<br>");
        const tempFile = lh.tempFileOf(sourceFile);
        await lh.writeFile(tempFile, patched);
        vscode.commands.executeCommand("vscode.diff", sourceFile, tempFile);
    }
    // vscode.workspace.openTextDocument({ content: patched });
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
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        browserNodeProvider.refresh();
        diffNodeProvider.refresh();
    });
}