<template>
  <q-page class="page">
    <div class="shop">

      <!-- Katalog: placeholder artikli -->
      <main class="shop__main">
        <div class="page-shell">
          <button class="back-link" @click="$router.push('/')">
            <q-icon name="arrow_back" size="14px" />
            <span>Odustani</span>
          </button>

          <div class="catalog">
            <button
              v-for="product in products"
              :key="product.id"
              class="product"
              :class="{ 'product--in-cart': quantityOf(product.id) }"
              @click="addToCart(product)"
            >
              <svg class="product__deco" viewBox="0 0 24 24" aria-hidden="true"><path :d="product.icon" /></svg>
              <svg class="product__icon" viewBox="0 0 24 24" aria-hidden="true"><path :d="product.icon" /></svg>
              <span class="product__name">{{ product.name }}</span>
              <span v-if="quantityOf(product.id)" class="product__qty">{{ quantityOf(product.id) }}</span>
              <q-icon v-else name="add" size="18px" class="product__add" />
            </button>
          </div>
        </div>
      </main>

      <!-- Košarica: gornji desni kut, izvan centriranog sadržaja -->
      <aside class="cart">
        <div class="cart__header">
          <span class="cart__title">
            <q-icon name="shopping_cart" size="16px" />
            <span>Košarica</span>
          </span>
          <span class="cart__count">{{ totalQuantity }}</span>
        </div>

        <div v-if="!cartItems.length" class="cart__empty">
          <q-icon name="remove_shopping_cart" size="32px" class="cart__empty-icon" />
          <span class="cart__empty-title">Košarica je prazna</span>
        </div>

        <ul v-else class="cart__list">
          <li v-for="item in cartItems" :key="item.id" class="cart__item">
            <span class="cart__item-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" /></svg>
            </span>
            <span class="cart__item-name">{{ item.name }}</span>
            <span class="cart__item-qty">× {{ item.quantity }}</span>
            <button class="cart__item-remove" title="Ukloni" @click="removeFromCart(item.id)">
              <q-icon name="close" size="14px" />
            </button>
          </li>
        </ul>

        <div class="cart__footer">
          <button class="btn btn--primary cart__submit" :disabled="!cartItems.length">
            <span>Pošalji zahtjev</span>
          </button>
        </div>
      </aside>

    </div>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue';

// Placeholder katalog za vizualni test. Ikone: 24×24 linijske putanje.
const products = [
  { id: 'papir',       name: 'Papir A4',         icon: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6' },
  { id: 'pisac',       name: 'Pisač',            icon: 'M7 9V3h10v6 M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3 M7 14h10v7H7z' },
  { id: 'olovke',      name: 'Kemijske olovke',  icon: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3' },
  { id: 'biljeznica',  name: 'Bilježnica',       icon: 'M6 3h12v18H6z M9 3v18 M12 8h3 M12 12h3' },
  { id: 'registrator', name: 'Registrator',      icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'kava',        name: 'Kava',             icon: 'M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z M16 10h1.5a2.5 2.5 0 0 1 0 5H16 M8 3v3 M12 3v3' },
  { id: 'baterije',    name: 'Baterije AA',      icon: 'M4 7h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M21 10v4 M7 10v4 M11 10v4' },
  { id: 'mis',         name: 'Miš',              icon: 'M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6z M12 7v3' },
  { id: 'tipkovnica',  name: 'Tipkovnica',       icon: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z M7 10h.01 M11 10h.01 M15 10h.01 M8 14h8' },
  { id: 'skare',       name: 'Škare',            icon: 'M3 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M8.5 7.5L20 18 M8.5 16.5L20 6' },
  { id: 'kutija',      name: 'Kutija za arhivu', icon: 'M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10' },
  { id: 'usb',         name: 'USB stick',        icon: 'M9 3h6v5H9z M7 8h10v9a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z M11 5.5h.01 M13 5.5h.01' },
  { id: 'zarulja',     name: 'Žarulja',          icon: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.4 1-1.9A6 6 0 0 0 12 3z' },
  { id: 'kalkulator',  name: 'Kalkulator',       icon: 'M6 3h12v18H6z M9 6h6v3H9z M9 13h.01 M12 13h.01 M15 13h.01 M9 17h.01 M12 17h.01 M15 17h.01' },
  { id: 'spajalice',   name: 'Spajalice',        icon: 'M8 12l6.5-6.5a3 3 0 0 1 4.2 4.2L11 17.5a5 5 0 0 1-7-7L10.5 4' },
  { id: 'voda',        name: 'Voda 0,5 l',       icon: 'M10 3h4v3l2 3v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-3z M8 13h8' },
];

const cartItems = ref([]);

const totalQuantity = computed(() =>
  cartItems.value.reduce((sum, item) => sum + item.quantity, 0)
);

function quantityOf(id) {
  return cartItems.value.find((item) => item.id === id)?.quantity ?? 0;
}

function addToCart(product) {
  const existing = cartItems.value.find((item) => item.id === product.id);
  if (existing) existing.quantity += 1;
  else cartItems.value.push({ ...product, quantity: 1 });
}

function removeFromCart(id) {
  cartItems.value = cartItems.value.filter((item) => item.id !== id);
}
</script>

<style scoped>
/* ─── Page ─── */
/* Desni i gornji razmak prate zaglavlje: 24px = padding topbara (avatar),
   16px = razmak ispod linije zaglavlja. */
.page {
  background: transparent;
  padding: 16px 24px 24px 40px;
  font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #111827;
}
.page-shell { max-width: 1400px; margin: 0 auto; }

/* ─── Odustani: tekstualni link ─── */
.back-link {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 16px;
  color: #6b7280;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s, gap 0.15s;
}
.back-link:hover { color: #1b2d59; gap: 6px; }

/* ─── Layout: katalog + košarica ─── */
.shop {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  align-items: start;
  gap: 32px;
}

.shop__main { min-height: 60vh; }

/* ─── Katalog: kockaste kartice (stil kartice Unutarnja nabava) ─── */
.catalog {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

.product {
  all: unset;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  aspect-ratio: 1 / 1;
  padding: 18px;
  overflow: hidden;
  background: linear-gradient(145deg, #eef0fe 0%, #dde2fb 100%);
  border: 1.5px solid #5b6cde;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(91, 108, 222, 0.12);
  box-sizing: border-box;
  cursor: pointer;
  transition: all 0.2s ease;
}
.product:hover {
  background: linear-gradient(145deg, #e0e5fd 0%, #ccd3f8 100%);
  border-color: #7482e6;
  box-shadow: 0 10px 32px rgba(91, 108, 222, 0.25);
  transform: scale(1.02);
}
.product:active { transform: scale(0.98); }

.product--in-cart {
  background: linear-gradient(145deg, #dde2fb 0%, #c9d0f7 100%);
  box-shadow: 0 0 0 3px rgba(91, 108, 222, 0.22), 0 4px 24px rgba(91, 108, 222, 0.16);
}

/* Linijske ikone: navy potez kao solarlinear SVG-ovi u public/ */
.product svg,
.cart__item-icon svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.product__icon {
  position: relative;
  z-index: 1;
  width: 40px;
  height: 40px;
  color: #1b2d59;
  transition: transform 0.2s ease;
}
.product:hover .product__icon { transform: translateY(-2px); }

.product__deco {
  position: absolute;
  right: -28px;
  bottom: -28px;
  width: 130px;
  height: 130px;
  color: #1b2d59;
  opacity: 0.08;
  transform: rotate(-18deg);
  pointer-events: none;
}

.product__name {
  position: relative;
  z-index: 1;
  color: #1b2d59;
  font-size: 0.875rem;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.product__add {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 1;
  color: rgba(27, 45, 89, 0.3);
  transition: color 0.15s;
}
.product:hover .product__add { color: #1b2d59; }

.product__qty {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: #5b6cde;
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ─── Košarica (navy/indigo, kao kartica Unutarnja nabava) ─── */
/* top: 53px fiksno zaglavlje + 16px razmak; visina do 24px od dna ekrana. */
.cart {
  position: sticky;
  top: 69px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 93px);
  min-height: 420px;
  background: #ffffff;
  border: 1.5px solid rgba(91, 108, 222, 0.35);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(91, 108, 222, 0.12);
  overflow: hidden;
}

.cart__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(145deg, #eef0fe 0%, #dde2fb 100%);
  border-bottom: 1.5px solid rgba(91, 108, 222, 0.2);
}

.cart__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1b2d59;
  font-size: 0.875rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.cart__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  background: #5b6cde;
  color: #ffffff;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.cart__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 20px;
  text-align: center;
}
.cart__empty-icon { color: #c7cdf5; }
.cart__empty-title { color: #6b7280; font-size: 0.875rem; font-weight: 600; }

.cart__list {
  flex: 1;
  margin: 0;
  padding: 8px 0;
  list-style: none;
  overflow-y: auto;
}

.cart__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 8px 20px;
  font-size: 0.875rem;
}
.cart__item + .cart__item { border-top: 1px solid #f3f4f6; }

.cart__item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #eef0fe;
  color: #1b2d59;
}
.cart__item-icon svg { width: 16px; height: 16px; }
.cart__item-name { flex: 1; min-width: 0; color: #111827; font-weight: 600; }
.cart__item-qty { color: #6b7280; font-variant-numeric: tabular-nums; }

.cart__item-remove {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: #9ca3af;
  cursor: pointer;
  transition: all 0.15s;
}
.cart__item-remove:hover { background: #fef2f2; color: #b91c1c; }

.cart__footer {
  padding: 16px 20px;
  border-top: 1.5px solid rgba(91, 108, 222, 0.2);
}
.cart__submit { width: 100%; }

@media (max-width: 900px) {
  .shop { grid-template-columns: 1fr; }
  .shop__main { min-height: 0; }
  .cart { position: static; height: auto; min-height: 360px; }
}

@media (max-width: 600px) {
  .page { padding: 16px; }
  .catalog { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
}
</style>
