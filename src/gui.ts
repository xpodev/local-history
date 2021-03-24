import * as vscode from 'vscode';
import * as lh from './extension';
import * as path from 'path';

export function initGUI() {
    const browserNodeProvider = new BrowserNodeProvider(lh.root_dir);
    vscode.window.registerTreeDataProvider('localHistoryFileBrowser', browserNodeProvider);
    vscode.commands.registerCommand('local-history.refresh-browser', browserNodeProvider.refresh);
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
        console.log(element);
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
            toRet.push(new PathItem(value[0], collapsibleState, itemPath))
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
    constructor(private workspaceRoot: vscode.Uri) {

    }

    private _onDidChangeTreeData: vscode.EventEmitter<PathItem | undefined | void> = new vscode.EventEmitter<PathItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<PathItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: PathItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        console.log(element);
        return element;
    }

    getChildren(element?: PathItem): vscode.ProviderResult<PathItem[]> {
        return Promise.resolve([]);
    }

}

class DiffItem extends vscode.TreeItem {

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

    contextValue = 'browserDiffItem';
}