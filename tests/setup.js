// Global browser-extension API mocks available in all test files.

// jsdom does not always expose these Node.js globals — add them explicitly.
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

global.chrome = {
  runtime: {
    onMessage: { addListener: jest.fn() },
    lastError: null,
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn(),
  },
};

global.fetch = jest.fn();

// jsdom does not implement these Blob URL helpers.
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();
