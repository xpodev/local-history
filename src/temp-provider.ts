import * as vscode from 'vscode';
import { DiffExt } from './diff-ext';

const tempFileProvider = new (class implements vscode.TextDocumentContentProvider {
	onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	onDidChange = this.onDidChangeEmitter.event;

	private _filePath!: vscode.Uri;
	async provideTextDocumentContent(uri: vscode.Uri): Promise<string | undefined> {
		this._filePath = uri;
		const tempFile = vscode.Uri.parse(uri.path);
		const pathParts = tempFile.path.split('/');
		// Last part is for the diff to know what type of file is the virtual document.
		pathParts.pop();
		// Get schema and remove it from the Uri parts.
		const schema = pathParts.pop();
		const commitIndex = parseInt(pathParts[pathParts.length - 2]);
		const patchIndex = parseInt(pathParts[pathParts.length - 1]);
		const filePath = vscode.Uri.parse(`${schema}:${pathParts.slice(0, -2).join('/')}`);
		const fileDiff = await DiffExt.load(filePath);
		if (fileDiff) {
			if (patchIndex > 0) {
				return fileDiff.commits[commitIndex].getPatched(patchIndex);
			} else {
				return fileDiff.getCommit(commitIndex);
			}
		}
		else {
			return undefined;
		}
	}

	refresh() {
		this.onDidChangeEmitter.fire(this._filePath);
	}

})();

export default tempFileProvider;