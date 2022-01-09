import * as vscode from 'vscode';
import { FileSystemUtils } from './utilities';
import { hideSync } from 'hidefile';
import { homedir } from 'os';

export const LH_WORKSPACES: LHWorkspaceFolderProvider[] = [];

const LH_DIR = ".lh";
const LH_IGNORE_FIlE = `${LH_DIR}/.lhignore`;

export class LHWorkspaceFolderProvider {
    constructor(public readonly rootDir: vscode.WorkspaceFolder, public readonly enabled: boolean = true) {
        this.lhDir = vscode.Uri.joinPath(this.rootDir.uri, LH_DIR);
        this.ignoreFile = vscode.Uri.joinPath(this.rootDir.uri, LH_IGNORE_FIlE);
    }

    public readonly ignoreFile: vscode.Uri;
    public readonly lhDir: vscode.Uri;

    async init() {
        if (await FileSystemUtils.fileExists(this.ignoreFile)) {
            return;
        } else {
            if (!(await FileSystemUtils.fileExists(this.lhDir))) {
                await vscode.workspace.fs.createDirectory(this.lhDir);
                try {
                    hideSync(this.lhDir.fsPath);
                } catch (e) {
                    // Can't change lhDir to hidden

                }
            }
            await FileSystemUtils.writeFile(this.ignoreFile,
                `# list file to not track by the local-history extension. comment line starts with a '#' character
# each line describe a regular expression pattern (search for "Javascript regex")
# it will relate to the workspace directory root. for example:
# ".*\\.txt" ignores any file with "txt" extension
# "/test/.*" ignores all the files under the "test" directory
# ".*/test/.*" ignores all the files under any "test" directory (even under sub-folders)
`
            );
        }
    }

    async ignoredFiles() {
        let lhIgnore = [`\\.lh/.*`];
        lhIgnore = lhIgnore.concat(await this.linesToArray(vscode.Uri.parse("file:" + homedir() + "/.lh/.lhignore")));
        lhIgnore = lhIgnore.concat(await this.linesToArray(this.ignoreFile));
        return lhIgnore;
    }

    async linesToArray(uri: vscode.Uri) {
        if (await FileSystemUtils.fileExists(uri)) {
            return (await FileSystemUtils.readFile(uri))
                .split(/[\r|\n]+/)
                .filter(Boolean)
                .filter((line) => {
                    return !(new RegExp(`^#.*$`).test(line));
                });
        } else {
            return [];
        }
    }

    async isIgnored(filePath: vscode.Uri) {
        const lhIgnored = await this.ignoredFiles();
        const relativePath = vscode.workspace.asRelativePath(filePath, false);
        return lhIgnored.filter((pattern) => {
            return new RegExp(`^${pattern}$`).test(relativePath);
        }).length > 0;
    }
}

export function isLHDir(folderUri: vscode.Uri): boolean {
    for (const folder of LH_WORKSPACES) {
        if (folderUri.path === folder.lhDir.path) {
            return true;
        }
    }
    return false;
}