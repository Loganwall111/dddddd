/**
 * Test registry + shared assertions (imported by both the runner and the tests).
 */
import H from './harness-assert.mjs';

export const tests = [];
export const test = (name, fn) => tests.push({ name, fn });
export { H };
