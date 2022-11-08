import * as vscode from 'vscode';
import { FileSystemUtils } from './utilities';
import { hideSync } from 'hidefile';
import { homedir } from 'os';
import { localHistoryDirectory, localHistoryIgnoreFile } from './config';

export const localHistoryWorkspaces: LocalHistoryWorkspaceFolderProvider[] = [];

export class LocalHistoryWorkspaceFolderProvider {
    constructor(public readonly rootDir: vscode.WorkspaceFolder, public readonly enabled: boolean = true) {
        this.localHistoryDir = vscode.Uri.joinPath(this.rootDir.uri, localHistoryDirectory());
        this.ignoreFile = vscode.Uri.joinPath(this.rootDir.uri, localHistoryIgnoreFile());
    }

    public readonly ignoreFile: vscode.Uri;
    public readonly localHistoryDir: vscode.Uri;

    async init() {
        if (await FileSystemUtils.fileExists(this.ignoreFile)) {
            return;
        } else {
            if (!(await FileSystemUtils.fileExists(this.localHistoryDir))) {
                await vscode.workspace.fs.createDirectory(this.localHistoryDir);
                try {
                    hideSync(this.localHistoryDir.fsPath);
                } catch (e) {
                    // Can't change lhDir to hidden

                }
            }
            await FileSystemUtils.writeFile(this.ignoreFile,
                `# list file to not track by the local-history extension. comment line starts with a '#' character
# each line describe a regular expression pattern (search for 'Javascript regex')
# it will relate to the workspace directory root. for example:
# '.*\\.txt' ignores any file with 'txt' extension
# '/test/.*' ignores all the files under the 'test' directory
# '.*/test/.*' ignores all the files under any 'test' directory (even under sub-folders)
`
            );
        }
    }

    async ignoredFiles() {
        let localHistoryIgnore = [`\\${localHistoryDirectory()}/.*`];
        localHistoryIgnore = localHistoryIgnore.concat(await this.linesToArray(vscode.Uri.parse(`file:${homedir()}/${localHistoryIgnoreFile()}`)));
        localHistoryIgnore = localHistoryIgnore.concat(await this.linesToArray(this.ignoreFile));
        return localHistoryIgnore;
    }

    async linesToArray(uri: vscode.Uri) {
        if (await FileSystemUtils.fileExists(uri)) {
            return (await FileSystemUtils.readFile(uri))
                .split(/[\r|\n]+/)
                .filter((line) => {
                    return line && !(new RegExp(`^#.*$`).test(line));
                });
        } else {
            return [];
        }
    }

    async isIgnored(filePath: vscode.Uri) {
        const localHistoryIgnored = await this.ignoredFiles();
        const relativePath = vscode.workspace.asRelativePath(filePath, false);
        return localHistoryIgnored.filter((pattern) => {
            return new RegExp(`^${pattern}$`).test(relativePath);
        }).length > 0;
    }
}

export function isLocalHistoryDir(folderUri: vscode.Uri): boolean {
    for (const folder of localHistoryWorkspaces) {
        if (folderUri.path === folder.localHistoryDir.path) {
            return true;
        }
    }
    return false;
}