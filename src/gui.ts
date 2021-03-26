import * as vscode from 'vscode';
import * as lh from './extension';
import * as utils from './utilities';
import * as path from 'path';
import * as Diff from 'diff';
import { EOL } from 'os';

let sourcePanel: vscode.WebviewPanel;
let patchedPanel: vscode.WebviewPanel;

class DiffItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly uri: lh.diff,
        public readonly command?: vscode.Command
    ) {
        super(label, collapsibleState);
    }

    iconPath = {
        light: path.join(__filename, '..', '..', 'media', 'logo.svg'),
        dark: path.join(__filename, '..', '..', 'media', 'logo.svg'),
    };

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
        const toRet: PathItem[] = [];
        f.forEach((value) => {
            if (vscode.Uri.joinPath(folderPath, value[0]).path === lh.lh_dir.path) {
                return;
            }
            let collapsibleState;
            switch (value[1]) {
                case vscode.FileType.File:
                    collapsibleState = vscode.TreeItemCollapsibleState.None;
                    break;
                case vscode.FileType.Directory:
                    collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                    break;
                default:
                    collapsibleState = vscode.TreeItemCollapsibleState.None;
            }
            const itemPath = vscode.Uri.joinPath(folderPath, value[0]);
            toRet.push(new PathItem(value[0], collapsibleState, itemPath, new OpenDiffCmd("Open Diff", "local-history.open-source", [itemPath])))
        })
        return toRet;
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

class DiffNodeProvider implements vscode.TreeDataProvider<DiffItem> {
    constructor() {

    }

    private _onDidChangeTreeData: vscode.EventEmitter<DiffItem | undefined | void> = new vscode.EventEmitter<DiffItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<DiffItem | undefined | void> = this._onDidChangeTreeData.event;

    private currentDiff: DiffItem[] = [];
    private rootDirectories: DiffItem[] = [];

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: DiffItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: DiffItem): vscode.ProviderResult<DiffItem[]> {
        return Promise.resolve(this.currentDiff);
    }

    async selectFile(filePath: vscode.Uri) {
        const fileDiff = await lh.loadFileDiff(filePath);
        if (fileDiff) {
            fileDiff.patches.forEach((value, index) => {
                const onOpenPatch = new OpenPatchCmd("Local History: Open Patch", "local-history.open-patch", [fileDiff, index, filePath])
                this.currentDiff.push(new DiffItem(`patch-${index + 1}`, vscode.TreeItemCollapsibleState.None, fileDiff, onOpenPatch));
            });
        } else {
            this.currentDiff = [];
        }
        this.refresh();
    }

    clearDiff() {
        this.currentDiff = [];
        this.refresh();
    }

}

const browserNodeProvider = new BrowserNodeProvider(lh.root_dir);
const diffNodeProvider = new DiffNodeProvider();

async function openPatch(fileDiff: lh.diff, index: number, source: vscode.Uri) {
    const patchId = index + 1;
    const patched = await lh.getPatched(fileDiff, patchId);
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
        const tempFile = lh.tempFileOf(source);
        if (await lh.fileExists(tempFile)) {
            await vscode.workspace.fs.writeFile(tempFile, utils.encode(patched));
        } else {
            await lh.createFile(tempFile, patched);
        }
        vscode.commands.executeCommand("vscode.diff", source, tempFile);
    }
    // vscode.workspace.openTextDocument({ content: patched });
}

async function restorePatch(diff: DiffItem) {
    
}

export function initGUI() {
    vscode.window.registerTreeDataProvider('localHistoryFileBrowser', browserNodeProvider);
    vscode.window.registerTreeDataProvider('localHistoryDiffBrowser', diffNodeProvider);

    vscode.commands.registerCommand('local-history.refresh-file-browser', browserNodeProvider.refresh);
    vscode.commands.registerCommand('local-history.open-source', async (filePath: vscode.Uri) => {
        await diffNodeProvider.selectFile(filePath);
    });
    vscode.commands.registerCommand('local-history.open-patch', async (fileDiff: lh.diff, patchId: number, source: vscode.Uri) => {
        await openPatch(fileDiff, patchId, source);
    });

    vscode.workspace.onDidCreateFiles((e) => {
        browserNodeProvider.refresh();
    });
    vscode.workspace.onDidDeleteFiles((e) => {
        browserNodeProvider.refresh();
    });
    vscode.workspace.onDidRenameFiles((e) => {
        browserNodeProvider.refresh();
    });
    vscode.workspace.onDidChangeTextDocument((e) => {
        e;
    });
}