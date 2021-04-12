import * as vscode from 'vscode';
import * as Diff from 'diff';
import { EOL } from 'os';
import { encode, fsUtils } from './utilities';

const NULL_PATCH = Diff.createPatch('', '', '');
const TEMP_SCHEME = "temp";

export enum DiffType {
    Commit = "commit",
    Patch = "patch"
}

class Commit {
    constructor(public content: string, public name: string) {

    }

    public activePatchIndex: number = 0;
    public readonly patches: patch[] = [];
    public readonly date: string = new Date().toISOString();

    get activePatch(): patch {
        return this.patches[this.activePatchIndex];
    }

    newPatch(content: string) {
        this.patches.push({
            date: new Date().toISOString(),
            content: content
        });
        this.activePatchIndex = this.patches.length - 1;
    }

    getPatched(index: number) {
        let patched = this.content;
        for (let i = 0; i <= index; i++) {
            const patchString = this.patches[i].content;
            const uniDiff = Diff.parsePatch(patchString);
            patched = Diff.applyPatch(patched, uniDiff[0]);
        }
        return patched;
    }
}

export class DiffExt {
    constructor(sourceFile: vscode.Uri) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceFile);
        this.rootDir = workspaceFolder ? workspaceFolder.uri : fsUtils.parentFolder(sourceFile);
        this.lhFolder = vscode.Uri.joinPath(this.rootDir, ".lh");
        this._sourceFile = vscode.workspace.asRelativePath(sourceFile, false);
        this.commits = [];
        this.activeCommitIndex = 0;
    }

    private readonly _sourceFile: string;
    private get _diffObject(): diff {
        return {
            sourceFile: this._sourceFile,
            activeCommit: this.activeCommitIndex,
            commits: this.commits
        };
    }
    public readonly rootDir: vscode.Uri;
    public readonly lhFolder: vscode.Uri;
    public commits: Commit[];
    public activeCommitIndex: number;

    get sourceFile() {
        return vscode.Uri.joinPath(this.rootDir, this._sourceFile);
    }

    get activeCommit(): Commit {
        return this.commits[this.activeCommitIndex];
    }


    get activePatches(): patch[] {
        return this.activeCommit.patches;
    }

    newCommit(data: string, name?: string) {
        name = name ?? `Commit-${this.commits.length}`;
        let createdCommit = new Commit(data, name);
        
        // Elazar thinks it's better like that
        createdCommit.newPatch(NULL_PATCH);
        
        this.commits.push(createdCommit);
        this.activeCommitIndex = this.commits.length - 1;
    }

    async renameCommit(index: number, name: string) {
        this.commits[index].name = name;
        await this.save();
    }

    async deleteCommit(index: number) {
        if (index === this.activeCommitIndex) {
            vscode.window.showErrorMessage("Can't delete the active commit. Did you mean to restore the previous commit?");
            return;
        }
        if (index < this.activeCommitIndex) {
            this.activeCommitIndex--;
        }
        this.commits.splice(index, 1);
        await this.save();
    }

    getDiffPath() {
        const relativeFilePath = vscode.workspace.asRelativePath(this.sourceFile);
        return vscode.Uri.joinPath(this.lhFolder, `${relativeFilePath}.json`);
    }

    getPatched(index: number, commitIndex?: number) {
        let commit;
        if (commitIndex != undefined) {
            commit = this.commits[commitIndex];
        } else {
            commit = this.activeCommit;
        }
        return commit.getPatched(index);
    }

    getCommit(index: number) {
        return this.commits[index].content;
    }

    tempURI(diffType: DiffType, index: number) {
        return vscode.Uri.joinPath(this.sourceFile.with({ scheme: TEMP_SCHEME }), `${diffType}/${index}`);
    }

    async restoreCommit(index: number) {
        await fsUtils.writeFile(this.sourceFile, this.getCommit(index));
        this.activeCommitIndex = index;
    }

    async restorePatch(index: number, commitIndex?: number) {
        await fsUtils.writeFile(this.sourceFile, this.getPatched(index, commitIndex));
        if (commitIndex != undefined) {
            this.activeCommitIndex = commitIndex;
        }
        this.activeCommit.activePatchIndex = index;
    }

    async loadDiff() {
        if (await fsUtils.fileExists(this.getDiffPath())) {
            const fileData: diff = JSON.parse(await fsUtils.readFile(this.getDiffPath()));
            this.commits = fileData.commits;
            this.activeCommitIndex = fileData.activeCommit;
        }
    }

    async save() {
        await vscode.workspace.fs.writeFile(this.getDiffPath(), encode(JSON.stringify(this._diffObject, null, 4)));
    }

    static async load(uri: vscode.Uri): Promise<DiffExt> {
        const diffObj = new DiffExt(uri);
        await diffObj.loadDiff();
        return diffObj;
    }
}

async function ignoredFiles(rootDir: vscode.Uri): Promise<string[]> {
	const lh_ignore = ['\\.lh/.*'];
    const ignoreFile = vscode.Uri.joinPath(rootDir, '.lhignore');
	if (await fsUtils.fileExists(ignoreFile)) {
		lh_ignore.concat((await vscode.workspace.fs.readFile(ignoreFile)).toString().split(EOL).filter(Boolean));
	}
    return lh_ignore;
}

type diff = {
    sourceFile: string,
    activeCommit: number,
    commits: Commit[]
}

type commit = {
    name: string,
    content: string,
    activePatch: number,
    patches: patch[],
    date: string
}

type patch = {
    content: string,
    date: string
}