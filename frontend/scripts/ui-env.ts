/* eslint-disable @typescript-eslint/no-explicit-any */
const { JSDOM } = require('jsdom');
const fakeIndexedDBModule = require('fake-indexeddb');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
dom.window.matchMedia =
  dom.window.matchMedia ||
  ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  }));
globalThis.matchMedia = dom.window.matchMedia;
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = RO;
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0)) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame = ((id: ReturnType<typeof setTimeout>) => clearTimeout(id)) as typeof cancelAnimationFrame;
globalThis.indexedDB = fakeIndexedDBModule.default;
dom.window.indexedDB = fakeIndexedDBModule.default;
globalThis.IDBKeyRange = fakeIndexedDBModule.IDBKeyRange;
