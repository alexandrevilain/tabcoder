import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension should be present', async () => {
		const extension = vscode.extensions.getExtension('alexandrevilain.tabcoder');
		assert.notStrictEqual(extension, undefined);
	});

	test('Extension should activate', async function () {
		this.timeout(10000);
		const extension = vscode.extensions.getExtension('alexandrevilain.tabcoder');
		if (!extension) {
			assert.fail('Extension not found');
		}

		try {
			await extension.activate();
			assert.strictEqual(extension.isActive, true);
		} catch (error) {
			assert.fail(`Failed to activate extension: ${error}`);
		}
	});
});