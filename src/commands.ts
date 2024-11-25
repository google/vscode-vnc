// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {VncSession} from './session';

async function commandConnect(context: vscode.ExtensionContext): Promise<void> {
  const hostname = await vscode.window.showInputBox({
    prompt: 'Enter VNC host name',
    placeHolder: 'localhost',
  });
  if (!hostname) {
    return;
  }

  const portStr = await vscode.window.showInputBox({
    prompt: 'Enter VNC port',
    placeHolder: '5900',
  });
  if (!portStr) {
    return;
  }
  const port = Number(portStr);
  if (isNaN(port)) {
    void vscode.window.showErrorMessage('Invalid port number');
    return;
  }

  const session = new VncSession(hostname, port, context);
  await session.start();
}

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('vnc.connect', () =>
      commandConnect(context)
    )
  );
}
