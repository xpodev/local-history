import { EOL } from 'os';
import * as vscode from 'vscode';
import { fsUtils } from './utilities';

const enabled = true;

const LH_DIR = ".lh";
const LH_IGNORE_FIlE = `${LH_DIR}/.lhignore`;

export class LHWorkspaceFolderProvider {
    constructor(public readonly rootDir: vscode.WorkspaceFolder) {
        this.lhDir = vscode.Uri.joinPath(this.rootDir.uri, LH_DIR);
        this.ignoreFile = vscode.Uri.joinPath(this.rootDir.uri, LH_IGNORE_FIlE);
    }

    public readonly ignoreFile: vscode.Uri;
    public readonly lhDir: vscode.Uri;

    async init() {
        if (await fsUtils.fileExists(this.ignoreFile)) {
            return;
        } else {
            if (!(await fsUtils.fileExists(this.lhDir))) {
                await vscode.workspace.fs.createDirectory(this.lhDir);
            }
            // CR Elazar: I think you shouldn't add ".lh/*" to this file. I think it should be ignored by default.
            // CR Neriya: And if someone wants to add diffs to the lh folder?
            // CR Elazar: you may drown him
            await fsUtils.writeFile(this.ignoreFile, "");
        }
    }

    async ignoredFiles() {
        let lhIgnore = ['\\.lh/.*'];
        if (await fsUtils.fileExists(this.ignoreFile)) {
            lhIgnore = lhIgnore.concat((await fsUtils.readFile(this.ignoreFile)).split(EOL).filter(Boolean));
        }
        return lhIgnore;
    }

    async isIgnored(filePath: vscode.Uri) {
        const lhIgnored = await this.ignoredFiles();
        const relativePath = vscode.workspace.asRelativePath(filePath, false);
        return lhIgnored.filter((pattern) => {
            return new RegExp(`^${pattern}$`).test(relativePath);
        }).length > 0;
    }
}