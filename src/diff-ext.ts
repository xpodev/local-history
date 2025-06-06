import * as vscode from 'vscode';
import * as Diff from 'diff';
import { encode, FileSystemUtils } from './utilities';
import { localHistoryWorkspaces } from './workspace-folder-provider';
import { localHistoryDirectory, maxPatches } from './config';

const NULL_PATCH = Diff.createPatch('', '', '');
const TEMP_SCHEME = 'temp';

export enum DiffType {
    commit = 'commit',
    patch = 'patch'
}

class Commit {
    constructor(data: CommitType);
    constructor(content: string, name: string);
    constructor(data: string | CommitType, name?: string) {
        if (typeof data === 'string') {
            this.name = name!;
            this.content = data;
        } else {
            this.name = data.name;
            this.date = data.date;
            this.content = data.content;
            this.patches = data.patches;
            this.activePatchIndex = data.activePatchIndex;
        }
    }

    public name: string;
    public content: string;
    public activePatchIndex: number = 0;
    public patches: Patch[] = [];
    public readonly date: number = Date.now();

    get activePatch(): Patch {
        return this.patches[this.activePatchIndex];
    }

    newPatch(content: string) {
        if (this.activePatchIndex < this.patches.length - 1) {
            // Removing the unnecessary patches.
            this.patches.splice(this.activePatchIndex + 1);
        }
        this.patches.push({
            date: Date.now(),
            content: content
        });

        if (this.patches.length > maxPatches()) {
            this.patches.shift();
        }

        this.activePatchIndex = this.patches.length - 1;
    }

    getPatched(index: number): string {
        let patched: string = this.content;
        for (let i = 0; i <= index; i++) {
            const patchString = this.patches[i].content;
            const uniDiff = Diff.parsePatch(patchString);
            patched = Diff.applyPatch(patched, uniDiff[0]);
        }
        return patched;
    }
}

export class DiffExtended {
    constructor(sourceFile: vscode.Uri) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceFile);
        this.rootDir = workspaceFolder ? workspaceFolder.uri : FileSystemUtils.parentFolder(sourceFile);
        this.localHistoryFolder = vscode.Uri.joinPath(this.rootDir, localHistoryDirectory());
        this._sourceFile = vscode.workspace.asRelativePath(sourceFile, false);
        this.commits = [];
        this.activeCommitIndex = 0;
    }

    private readonly _sourceFile: string;
    private get _diffObject(): Diff {
        return {
            sourceFile: this._sourceFile,
            activeCommit: this.activeCommitIndex,
            commits: this.commits
        };
    }
    public readonly rootDir: vscode.Uri;
    public readonly localHistoryFolder: vscode.Uri;
    public commits: Commit[];
    public activeCommitIndex: number;

    get sourceFile() {
        return vscode.Uri.joinPath(this.rootDir, this._sourceFile);
    }

    get activeCommit(): Commit {
        return this.commits[this.activeCommitIndex];
    }


    get activePatches(): Patch[] {
        return this.activeCommit.patches;
    }

    newCommit(data: string | CommitType, name: string) {
        let createdCommit: Commit;
        if (typeof data === 'string') {
            createdCommit = new Commit(data, name);
        } else {
            createdCommit = new Commit(data);
        }

        // Elazar thinks it's better like that
        createdCommit.newPatch(NULL_PATCH);
        const deletePatches = vscode.workspace.getConfiguration('local-history').get<boolean>('commits.clearPatchesOnNewCommit');
        if (deletePatches) {
            this.commits.forEach((commit) => {
                commit.patches = [];
                commit.activePatchIndex = 0;
            });
        }
        this.commits.push(createdCommit);
        this.activeCommitIndex = this.commits.length - 1;
    }

    async renameCommit(index: number, name: string) {
        this.commits[index].name = name;
        await this.save();
    }

    async deleteCommit(index: number) {
        if (index === this.activeCommitIndex) {
            vscode.window.showErrorMessage('Can\'t delete the active commit. Did you mean to restore the previous commit?');
            return;
        }
        if (index < this.activeCommitIndex) {
            this.activeCommitIndex--;
        }
        this.commits.splice(index, 1);
        await this.save();
    }

    getDiffPath() {
        const relativeFilePath = vscode.workspace.asRelativePath(this.sourceFile).split('/');
        if (localHistoryWorkspaces.length > 1) {
            relativeFilePath.shift();
        }
        return vscode.Uri.joinPath(this.localHistoryFolder, `${relativeFilePath.join('/')}.json`);
    }

    getPatched(index: number, commitIndex?: number): string {
        let commit;
        if (commitIndex !== undefined) {
            commit = this.commits[commitIndex];
        } else {
            commit = this.activeCommit;
        }
        return commit.getPatched(index);
    }

    getCommit(index: number) {
        return this.commits[index].content;
    }

    tempURI(commitIndex: number, patchIndex: number) {
        return vscode.Uri.joinPath(
            this.sourceFile.with({ scheme: TEMP_SCHEME }),
            `${commitIndex}/${patchIndex}/${this.sourceFile.scheme}/${FileSystemUtils.filename(this.sourceFile)}` // The last part is there for intellisense, it is removed in the tempFileProvider
        );
    }

    async restoreCommit(index: number) {
        await FileSystemUtils.writeFile(this.sourceFile, this.getCommit(index));
        this.activeCommitIndex = index;
        await this.save();
    }

    async restorePatch(index: number, commitIndex?: number) {
        await FileSystemUtils.writeFile(this.sourceFile, this.getPatched(index, commitIndex));
        if (commitIndex !== undefined) {
            this.activeCommitIndex = commitIndex;
        }
        this.activeCommit.activePatchIndex = index;
        await this.save();
    }

    async loadDiff() {
        const foo = this.getDiffPath();
        const exists = await FileSystemUtils.fileExists(foo);
        if (exists) {
            const fileData = JSON.parse(await FileSystemUtils.readFile(this.getDiffPath()));
            fileData.commits.forEach((data: CommitType) => {
                this.commits.push(new Commit(data));
            });
            this.activeCommitIndex = fileData.activeCommit;
        }
    }

    async save() {
        await vscode.workspace.fs.writeFile(this.getDiffPath(), encode(JSON.stringify(this._diffObject, null, 4)));
    }

    static async load(uri: vscode.Uri): Promise<DiffExtended> {
        const diffObj = new DiffExtended(uri);
        await diffObj.loadDiff();
        return diffObj;
    }
}

type Diff = {
    sourceFile: string,
    activeCommit: number,
    commits: Commit[]
};

export type CommitType = {
    name: string,
    content: string,
    activePatchIndex: number,
    patches: Patch[],
    date: number
};

type Patch = {
    content: string,
    date: number
};