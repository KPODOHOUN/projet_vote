import { test } from "node:test";
import * as assert from "node:assert/strict";
import { defaultTicketDesign, TICKET_TEMPLATES, type DesignLayer, type TicketDesign } from "./ticket-design";
import { alignToCanvas, editorReducer, fitImageBox, fitTextHeight, initialEditorState, resizeBox, resizeCanvas, rotationFromPointer, snapMove } from "./ticket-editor";

const blank: TicketDesign = { width: 1000, height: 500, background: { type: "color", value: "#000" }, backgroundImage: null, layers: [] };
const layer = (id: string, x = 10, y = 10): DesignLayer => ({ id, type: "text", content: id, x, y, width: 100, height: 40, zIndex: 1, visible: true, style: {} });

test("annuler / rétablir : chaque action est une étape", () => {
  let s = initialEditorState(blank);
  s = editorReducer(s, { type: "addLayer", layer: layer("a") });
  s = editorReducer(s, { type: "addLayer", layer: layer("b") });
  assert.equal(s.design.layers.length, 2);
  assert.equal(s.selectedId, "b");
  s = editorReducer(s, { type: "undo" });
  assert.equal(s.design.layers.length, 1);
  assert.equal(s.selectedId, null, "le calque annulé n'est plus sélectionné");
  s = editorReducer(s, { type: "redo" });
  assert.equal(s.design.layers.length, 2);
  s = editorReducer(s, { type: "undo" });
  s = editorReducer(s, { type: "addLayer", layer: layer("c") });
  assert.equal(s.future.length, 0, "une nouvelle action efface les étapes à rétablir");
});

test("frappe dans un champ et glisser : une seule étape d'historique", () => {
  let s = editorReducer(initialEditorState(blank), { type: "addLayer", layer: layer("a") });
  const before = s.past.length;
  for (const content of ["H", "He", "Hel", "Hello"]) {
    s = editorReducer(s, { type: "updateLayer", id: "a", patch: { content }, coalesce: "a:content" });
  }
  assert.equal(s.past.length, before + 1);
  s = editorReducer(s, { type: "checkpoint" });
  for (const x of [20, 40, 60]) s = editorReducer(s, { type: "updateLayer", id: "a", patch: { x }, transient: true });
  assert.equal(s.past.length, before + 2);
  s = editorReducer(s, { type: "undo" });
  assert.equal(s.design.layers[0]!.x, 10, "annuler revient avant le glisser");
  assert.equal(s.design.layers[0]!.content, "Hello");
});

test("ordre des calques : premier plan, arrière-plan, duplication", () => {
  let s = initialEditorState(blank);
  for (const id of ["a", "b", "c"]) s = editorReducer(s, { type: "addLayer", layer: layer(id) });
  s = editorReducer(s, { type: "arrange", id: "a", to: "front" });
  const order = () => [...s.design.layers].sort((x, y) => x.zIndex - y.zIndex).map((l) => l.id).join("");
  assert.equal(order(), "bca");
  s = editorReducer(s, { type: "arrange", id: "a", to: "back" });
  assert.equal(order(), "abc");
  s = editorReducer(s, { type: "duplicateLayer", id: "b" });
  assert.equal(s.design.layers.length, 4);
  assert.equal(s.design.layers.at(-1)!.x, 30);
  s = editorReducer(s, { type: "addLayer", layer: { ...layer("qr"), type: "qr" } });
  const count = s.design.layers.length;
  assert.equal(editorReducer(s, { type: "duplicateLayer", id: "qr" }).design.layers.length, count, "un seul QR code");
});

test("poignées : bords, coins, proportions gardées", () => {
  const box = { x: 100, y: 100, width: 200, height: 100 };
  assert.deepEqual(resizeBox(box, "e", 50, 0), { x: 100, y: 100, width: 250, height: 100 });
  assert.deepEqual(resizeBox(box, "nw", 20, 10), { x: 120, y: 110, width: 180, height: 90 });
  assert.deepEqual(resizeBox(box, "se", 100, 0, { keepRatio: true }), { x: 100, y: 100, width: 300, height: 150 });
  assert.deepEqual(resizeBox(box, "w", 500, 0), { x: 292, y: 100, width: 8, height: 100 }, "jamais sous la taille minimale");
});

test("rotation : angle depuis le centre, crans de 15° avec Maj", () => {
  assert.equal(rotationFromPointer({ x: 0, y: 0 }, { x: 0, y: -10 }), 0);
  assert.equal(rotationFromPointer({ x: 0, y: 0 }, { x: 10, y: 0 }), 90);
  assert.equal(rotationFromPointer({ x: 0, y: 0 }, { x: 10, y: -9 }, true), 45);
});

test("repères magnétiques : centre du billet et bords des autres calques", () => {
  const design = { ...blank, layers: [layer("other", 600, 300)] };
  const centered = snapMove({ x: 446, y: 50, width: 100, height: 40 }, design, "moving", 8);
  assert.equal(centered.x, 450);
  assert.deepEqual(centered.guides.vertical, [500]);
  const onEdge = snapMove({ x: 300, y: 296, width: 100, height: 40 }, design, "moving", 8);
  assert.equal(onEdge.y, 300);
  const free = snapMove({ x: 300, y: 120, width: 100, height: 40 }, design, "moving", 8);
  assert.deepEqual([free.x, free.y, free.guides.vertical.length, free.guides.horizontal.length], [300, 120, 0, 0]);
});

test("alignement et changement de format", () => {
  assert.deepEqual(alignToCanvas({ x: 5, y: 5, width: 100, height: 50 }, blank, "center"), { x: 450, y: 5 });
  assert.deepEqual(alignToCanvas({ x: 5, y: 5, width: 100, height: 50 }, blank, "bottom"), { x: 5, y: 450 });
  const vertical = resizeCanvas(defaultTicketDesign(), 720, 1280);
  assert.equal(vertical.width, 720);
  const qr = vertical.layers.find((l) => l.type === "qr")!;
  assert.equal(qr.width, qr.height, "le QR code reste carré");
  assert.ok(qr.x + qr.width <= 720);
});

test("image ajoutée : proportions gardées, centrée, pas plus grande que le billet", () => {
  const box = fitImageBox(blank, 2000, 1000);
  assert.equal(Math.round(box.width / box.height), 2);
  assert.ok(box.width <= 400 && box.x === Math.round((1000 - box.width) / 2));
});

test("modèles : tous ont un QR code", () => {
  for (const template of TICKET_TEMPLATES) {
    assert.equal(template.build().layers.filter((l) => l.type === "qr").length, 1, template.id);
  }
});

test("un texte sur plusieurs lignes agrandit son cadre, sans jamais le rétrécir", () => {
  const text = { height: 40, style: { fontSize: 20, lineHeight: 1.5 } };
  assert.equal(fitTextHeight(text, "Pass VIP\nAccès loge"), 60);
  assert.equal(fitTextHeight(text, "Une ligne"), 40);
});
