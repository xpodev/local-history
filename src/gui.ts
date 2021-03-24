import * as vscode from 'vscode';
import * as lh from './extension';
import * as path from 'path';

export function initGUI() {
    vscode.window.registerTreeDataProvider('localHistoryFileBrowser', browserNodeProvider);
    vscode.window.registerTreeDataProvider('localHistoryDiffBrowser', diffNodeProvider);

    vscode.commands.registerCommand('local-history.refresh-file-browser', browserNodeProvider.refresh);
    vscode.commands.registerCommand('local-history.list-file-diff', async (filePath: vscode.Uri) => {
        await listFileDiff(filePath);
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
            toRet.push(new PathItem(value[0], collapsibleState, itemPath, new OpenDiff("Open Diff", "local-history.list-file-diff", [itemPath])))
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

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: DiffItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: DiffItem): vscode.ProviderResult<DiffItem[]> {
        return Promise.resolve(this.currentDiff);
    }

    loadDiff(fileDiff: lh.diff) {
        this.currentDiff = [];
        fileDiff.patches.forEach((value, index) => {
            this.currentDiff.push(new DiffItem(`patch-${index + 1}`, vscode.TreeItemCollapsibleState.None));
        });
        this.refresh();
    }

    clearDiff() {
        this.currentDiff = [];
        this.refresh();
    }

}

class DiffItem extends vscode.TreeItem {

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
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

class OpenDiff implements vscode.Command {
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

const diffNodeProvider = new DiffNodeProvider();
const browserNodeProvider = new BrowserNodeProvider(lh.root_dir);

async function listFileDiff(filePath: vscode.Uri) {
    const fileDiff = await lh.loadFileDiff(filePath);
    if (fileDiff) {
        diffNodeProvider.loadDiff(fileDiff);
    } else {
        diffNodeProvider.clearDiff();
    }
}