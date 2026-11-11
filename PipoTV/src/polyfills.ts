// Funciones que faltan en el navegador de webOS 4 (Chromium 53).
/* eslint-disable @typescript-eslint/no-explicit-any */
const O = Object as any;
if (!O.entries) O.entries = (o: any) => Object.keys(o).map((k) => [k, o[k]]);
if (!O.values) O.values = (o: any) => Object.keys(o).map((k) => o[k]);
const S = String.prototype as any;
if (!S.padStart) {
  S.padStart = function (this: string, len: number, fill = ' ') {
    let s = String(this);
    while (s.length < len) s = fill + s;
    return s.slice(s.length - Math.max(len, String(this).length));
  };
}
const E = Element.prototype as any;
if (!E.closest) {
  E.closest = function (this: Element, sel: string) {
    let el: Element | null = this;
    while (el && !el.matches(sel)) el = el.parentElement;
    return el;
  };
}
export {};
