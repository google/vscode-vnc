// Copyright 2022 The ChromiumOS Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as vscode from 'vscode';
import {VncSession} from './session';

const defaults = {
  host: 'localhost',
  port: '5900',
};

async function commandConnect(context: vscode.ExtensionContext): Promise<void> {
  const hostnameInput = await vscode.window.showInputBox({
    prompt: 'Enter VNC host name',
    placeHolder: defaults.host,
  });
  if (hostnameInput === undefined) {
    return;
  }
  const hostname = hostnameInput || defaults.host;

  const portInput = await vscode.window.showInputBox({
    prompt: 'Enter VNC port',
    placeHolder: defaults.port,
  });
  if (portInput === undefined) {
    return;
  }
  const port = Number(portInput || defaults.port);
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
