import { test } from "node:test";
import * as assert from "node:assert/strict";
import { cloudinaryTransform, ogImageUrl } from "./og-image-url";

test("ogImageUrl : Cloudinary reçoit le recadrage 1200×630", () => {
  assert.equal(
    ogImageUrl("https://res.cloudinary.com/demo/image/upload/v1/events/logo.png"),
    "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/v1/events/logo.png"
  );
});

test("ogImageUrl : une URL déjà transformée n'est pas transformée deux fois", () => {
  const url = "https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/v1/a.png";
  assert.equal(ogImageUrl(url), url);
});

test("ogImageUrl : hôte tiers inchangé, URL invalide ou vide → null", () => {
  assert.equal(ogImageUrl("https://lh3.googleusercontent.com/a/photo.jpg"), "https://lh3.googleusercontent.com/a/photo.jpg");
  assert.equal(ogImageUrl("pas une url"), null);
  assert.equal(ogImageUrl(""), null);
  assert.equal(ogImageUrl(null), null);
  assert.equal(ogImageUrl("http://res.cloudinary.com/demo/image/upload/a.png"), "http://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,f_jpg,q_auto/a.png");
});

test("cloudinaryTransform : photo candidat en largeur fixe, autre hôte inchangé", () => {
  assert.equal(
    cloudinaryTransform("https://res.cloudinary.com/d/image/upload/c.jpg", "w_160,c_fill"),
    "https://res.cloudinary.com/d/image/upload/w_160,c_fill/c.jpg"
  );
  assert.equal(cloudinaryTransform("https://img.test/c.jpg", "w_160"), "https://img.test/c.jpg");
});
