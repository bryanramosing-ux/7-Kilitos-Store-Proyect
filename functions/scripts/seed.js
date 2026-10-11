#!/usr/bin/env node
// Carga la configuración, categorías y productos DEMOSTRATIVOS iniciales.
// Es idempotente: no sobrescribe documentos que ya existen.
//
//   Emulador:        node functions/scripts/seed.js --emulator
//   Proyecto real:   node functions/scripts/seed.js --project <id> --confirm [--only settings,categories]
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { categories, products, settings } from './seed-data.js';
import { fail, initAdmin, parseArgs } from './cli.js';

const args = parseArgs();
const target = initAdmin(args);
if (!target.emulator && !args.confirm) {
  fail(`Vas a escribir datos de demostración en el proyecto real "${target.projectId}". Repite el comando con --confirm.`);
}
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : new Set(['settings', 'categories', 'products']);
const db = getFirestore();
const now = Timestamp.now();
const actor = { uid: 'seed', email: null, role: 'admin' };
const summary = { created: [], skipped: [] };

async function createIfMissing(ref, data) {
  try {
    await ref.create(data);
    summary.created.push(ref.path);
    return true;
  } catch (error) {
    if (error.code === 6 || /already exists/i.test(error.message)) {
      summary.skipped.push(ref.path);
      return false;
    }
    throw error;
  }
}

if (only.has('settings')) {
  await createIfMissing(db.doc('storeSettings/public'), { ...settings, updatedAt: now, updatedBy: actor.uid });
}

if (only.has('categories')) {
  for (const { id, ...category } of categories) {
    await createIfMissing(db.collection('categories').doc(id), {
      ...category,
      slug: id,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

if (only.has('products')) {
  for (const { id, stock, ...product } of products) {
    const ref = db.collection('products').doc(id);
    await db.runTransaction(async (tx) => {
      const [productSnap, skuSnap] = await tx.getAll(ref, db.collection('skus').doc(product.sku));
      if (productSnap.exists || skuSnap.exists) {
        summary.skipped.push(ref.path);
        return;
      }
      tx.create(ref, {
        sku: product.sku,
        name: product.name,
        description: product.description ?? '',
        features: product.features ?? [],
        categoryId: product.categoryId,
        price: product.price,
        compareAtPrice: product.compareAtPrice ?? null,
        lowStockThreshold: product.lowStockThreshold ?? null,
        images: [],
        options: product.options ?? [],
        badge: product.badge ?? '',
        featured: product.featured ?? false,
        active: true,
        isDemo: true,
        stock,
        salesCount: 0,
        createdAt: now,
        createdBy: actor.uid,
        updatedAt: now,
        updatedBy: actor.uid,
      });
      tx.create(db.collection('skus').doc(product.sku), { productId: id, createdAt: now });
      tx.create(db.collection('productPrivate').doc(id), { cost: null, updatedAt: now, updatedBy: actor.uid });
      if (stock > 0) {
        tx.create(db.collection('inventoryMovements').doc(), {
          productId: id,
          sku: product.sku,
          productName: product.name,
          type: 'stock_inicial',
          quantity: stock,
          stockBefore: 0,
          stockAfter: stock,
          reason: 'Stock inicial de demostración',
          orderId: null,
          requestId: null,
          userUid: actor.uid,
          userEmail: null,
          userRole: actor.role,
          createdAt: now,
        });
      }
      summary.created.push(ref.path);
    });
  }
}

console.log(`Proyecto: ${target.projectId}${target.emulator ? ' (emulador)' : ''}`);
console.log(`✔ Creados: ${summary.created.length}`);
summary.created.forEach((path) => console.log(`   + ${path}`));
console.log(`• Ya existían (sin cambios): ${summary.skipped.length}`);
process.exit(0);
