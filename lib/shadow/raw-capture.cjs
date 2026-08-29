'use strict';

const { captureRawInput } = require('./shadow-harness.cjs');

/** Capture a DOM/form payload before calculator parsing, defaults, or normalization. */
function captureBeforeNormalization(formPayload, metadata = {}) {
  return captureRawInput(formPayload, { ...metadata, collectorVersion: metadata.collectorVersion || 'shadow-raw-capture-0.1.0' });
}

module.exports = { captureBeforeNormalization };
