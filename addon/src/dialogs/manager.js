const DIALOG_TTL_MS = 10 * 60 * 1000;

const handlers = new Map();
const activeDialogs = new Map();

function registerDialogHandler(type, handler) {
  handlers.set(type, handler);
}

function startDialog(sessionId, type, state = {}) {
  if (!sessionId) {
    throw new Error('Cannot start dialog without sessionId');
  }
  const handler = handlers.get(type);
  if (!handler) {
    throw new Error(`Unknown dialog type: ${type}`);
  }

  const dialogState = {
    type,
    state,
    updatedAt: Date.now(),
  };
  activeDialogs.set(sessionId, dialogState);

  return {
    text: handler.getPrompt(dialogState.state),
    shouldEndSession: false,
  };
}

function clearDialog(sessionId) {
  if (sessionId) {
    activeDialogs.delete(sessionId);
  }
}

async function continueDialogIfActive(body, config) {
  cleanupExpiredDialogs();
  const sessionId = body?.session?.sessionId;
  if (!sessionId) {
    return null;
  }

  const dialog = activeDialogs.get(sessionId);
  if (!dialog) {
    return null;
  }

  const handler = handlers.get(dialog.type);
  if (!handler) {
    activeDialogs.delete(sessionId);
    return null;
  }

  dialog.updatedAt = Date.now();
  const turn = await handler.handleTurn({
    state: dialog.state,
    config,
    request: body?.request,
  });

  if (turn.endDialog) {
    activeDialogs.delete(sessionId);

    // Chain to another dialog if requested
    if (turn.chainDialog?.type) {
      const chainHandler = handlers.get(turn.chainDialog.type);
      if (chainHandler) {
        const chainState = {
          type: turn.chainDialog.type,
          state: turn.chainDialog.state || {},
          updatedAt: Date.now(),
        };
        activeDialogs.set(sessionId, chainState);
      }
    }
  } else {
    dialog.state = turn.state || dialog.state;
    activeDialogs.set(sessionId, dialog);
  }

  return {
    text: turn.text,
    shouldEndSession: turn.shouldEndSession ?? turn.endDialog !== false,
  };
}

function cleanupExpiredDialogs() {
  const now = Date.now();
  for (const [sessionId, dialog] of activeDialogs.entries()) {
    if ((now - dialog.updatedAt) > DIALOG_TTL_MS) {
      activeDialogs.delete(sessionId);
    }
  }
}

module.exports = {
  registerDialogHandler,
  startDialog,
  clearDialog,
  continueDialogIfActive,
};
